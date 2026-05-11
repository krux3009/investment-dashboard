"""Dividend / distribution ledger — yfinance `Ticker(symbol).dividends`.

Surfaces:
  • Income-ledger block on `/portfolio` (TTM totals + next ex-date per name).
  • Small ƒ glyph on the holdings table when ex-date ≤14 days out.

Source data: only `Ticker.dividends`, which returns a `pd.Series` indexed
by ex-date in native currency. SGX REITs (K71U) land in the same Series.
yfinance doesn't split out return-of-capital, so figures are gross.

Why not `Ticker.info`: that call routinely hangs for tens of seconds per
ticker (and sometimes never returns) because it scrapes a large
key-stats payload. We avoid it entirely. Native currency comes from the
position's own `Position.currency` field. REIT classification uses a
suffix + name heuristic (good enough for the gross-distribution
footnote). The next ex-date is estimated by adding the inferred payment
cadence to the most recent historical ex-date.

TTM math: rolling 365-day window over the dividend Series, multiplied
by current share count. Mid-year holdings get a caveat caption — we
don't track historical position weight.

FX policy: today's spot rate for every row (historical + upcoming). A
historical FX cache is deferred to the stretch tier; for an
observational ledger surfacing "what your book yields right now in USD"
this is honest.

Cache: `dividends_cache` keyed `(code, ex_date)` for the per-payment
history (absorbs yfinance revisions via INSERT OR REPLACE), and
`dividends_fetch_log` keyed by code for the per-name 24h TTL + next-ex
marker. Single-writer rule preserved via `prices._db()` + `_DB_LOCK`.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from api import fx
from api.data import prices
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)

_TTL = timedelta(hours=24)
_TTM_WINDOW = timedelta(days=365)
_HISTORY_LIMIT = 8


@dataclass(frozen=True)
class DividendPayment:
    ex_date: str                       # ISO date, e.g. "2025-08-15"
    amount_per_share_native: float
    amount_total_native: float         # per_share × current_shares
    amount_total_usd: float


@dataclass(frozen=True)
class HoldingDividend:
    code: str
    ticker: str
    name: str
    currency: str
    shares_held: float
    is_reit: bool
    next_ex_date: str | None
    next_amount_per_share_native: float | None
    next_amount_total_usd: float | None
    ttm_per_share_native: float
    ttm_total_native: float
    ttm_total_usd: float
    history_count: int
    history: list[DividendPayment] = field(default_factory=list)


@dataclass(frozen=True)
class DividendsResponse:
    as_of: str
    items: list[HoldingDividend]
    totals_ttm_total_usd: float
    totals_next_30d_total_usd: float
    totals_next_90d_total_usd: float
    rates_used: dict[str, float]


def _to_yfinance_symbol(code: str) -> str | None:
    """Duplicate of api.earnings._to_yfinance_symbol — kept duplicated to
    avoid coupling dividends to earnings' import surface.
    """
    if "." not in code:
        return code
    market, ticker = code.split(".", 1)
    market = market.upper()
    if market == "US":
        return ticker
    if market == "HK":
        return f"{ticker.zfill(4)}.HK"
    if market == "SG":
        return f"{ticker}.SI"
    if market == "JP":
        return f"{ticker}.T"
    if market == "CN":
        if ticker.startswith("6"):
            return f"{ticker}.SS"
        return f"{ticker}.SZ"
    return None


def _is_reit(symbol: str, position_name: str) -> bool:
    """REIT heuristic from the symbol suffix + the moomoo-reported
    instrument name. SGX `.SI` suffix is a strong signal for REITs in
    this book; combined with a "REIT" / "TRUST" substring check on the
    name we catch the common cases. Used only to surface the
    gross-distribution footnote on the UI — false negatives are fine
    (footnote just doesn't appear). No yfinance `.info` call needed.
    """
    upper_name = position_name.upper()
    if "REIT" in upper_name:
        return True
    if symbol.endswith(".SI") and "TRUST" in upper_name:
        return True
    return False


# ── Cache ────────────────────────────────────────────────────────────────────


def _ensure_tables() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS dividends_cache (
                code VARCHAR NOT NULL,
                ex_date DATE NOT NULL,
                amount_per_share DOUBLE,
                currency VARCHAR,
                fetched_at TIMESTAMP,
                PRIMARY KEY (code, ex_date)
            )
            """
        )
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS dividends_fetch_log (
                code VARCHAR PRIMARY KEY,
                fetched_at TIMESTAMP,
                next_ex_date DATE,
                next_amount_per_share DOUBLE,
                is_reit BOOLEAN,
                currency VARCHAR
            )
            """
        )


def _read_log(code: str) -> dict | None:
    _ensure_tables()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT fetched_at, next_ex_date, next_amount_per_share, is_reit, currency "
            "FROM dividends_fetch_log WHERE code = ?",
            [code],
        ).fetchone()
    if not row:
        return None
    fetched_at, next_ex_date, next_amount, is_reit, currency = row
    if datetime.now() - fetched_at > _TTL:
        return None
    return {
        "fetched_at": fetched_at,
        "next_ex_date": next_ex_date,
        "next_amount_per_share": next_amount,
        "is_reit": bool(is_reit) if is_reit is not None else False,
        "currency": currency,
    }


def _read_history(code: str) -> list[tuple[date, float, str | None]]:
    """Return cached history oldest-first. Caller reverses for display."""
    _ensure_tables()
    with prices._DB_LOCK:
        rows = prices._db().execute(
            "SELECT ex_date, amount_per_share, currency FROM dividends_cache "
            "WHERE code = ? ORDER BY ex_date ASC",
            [code],
        ).fetchall()
    return [(r[0], float(r[1] or 0), r[2]) for r in rows]


def _write_log(
    code: str,
    next_ex_date: date | None,
    next_amount: float | None,
    is_reit: bool,
    currency: str | None,
) -> None:
    _ensure_tables()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO dividends_fetch_log VALUES (?, ?, ?, ?, ?, ?)",
            [code, datetime.now(), next_ex_date, next_amount, is_reit, currency],
        )


def _write_history(code: str, currency: str | None, history: list[tuple[date, float]]) -> None:
    if not history:
        return
    _ensure_tables()
    now = datetime.now()
    with prices._DB_LOCK:
        prices._db().executemany(
            "INSERT OR REPLACE INTO dividends_cache VALUES (?, ?, ?, ?, ?)",
            [(code, d, amt, currency, now) for d, amt in history],
        )


# ── yfinance fetch ──────────────────────────────────────────────────────────


def _fetch_one(code: str, currency: str, position_name: str) -> dict | None:
    """Fetch + cache one holding's dividend history + estimated next
    ex-date. Skips `Ticker.info` entirely — that call is unreliable and
    routinely hangs. Currency comes from the caller (the moomoo
    Position); next ex-date is estimated from history cadence.

    Returns a dict shaped like:
      {
        "currency": "USD" | "SGD" | ...
        "is_reit": bool,
        "next_ex_date": date | None,
        "next_amount_per_share": float | None,
        "history": [(date, per_share_native), ...]   # oldest first
      }
    Or None if the symbol can't be resolved to a yfinance ticker at all.
    """
    log_row = _read_log(code)
    if log_row is not None:
        return {
            "currency": log_row["currency"] or currency,
            "is_reit": log_row["is_reit"],
            "next_ex_date": log_row["next_ex_date"],
            "next_amount_per_share": log_row["next_amount_per_share"],
            "history": [(d, amt) for d, amt, _ in _read_history(code)],
        }

    symbol = _to_yfinance_symbol(code)
    if not symbol:
        _write_log(code, None, None, False, currency)
        return None

    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol)
        series = ticker.dividends
    except Exception as exc:
        log.warning("yfinance dividends fetch %s failed: %s", code, exc)
        _write_log(code, None, None, False, currency)
        return None

    is_reit = _is_reit(symbol, position_name)

    history: list[tuple[date, float]] = []
    try:
        if series is not None and not series.empty:
            for idx, val in series.items():
                # yfinance returns a tz-aware DatetimeIndex; coerce to date.
                if hasattr(idx, "date"):
                    d = idx.date()
                else:
                    d = idx  # type: ignore[assignment]
                if isinstance(d, date) and val is not None:
                    history.append((d, float(val)))
    except Exception as exc:
        log.warning("yfinance dividends parse %s failed: %s", code, exc)

    history.sort(key=lambda x: x[0])

    next_ex_date, next_amount = _estimate_next(history)

    _write_history(code, currency, history)
    _write_log(code, next_ex_date, next_amount, is_reit, currency)

    return {
        "currency": currency,
        "is_reit": is_reit,
        "next_ex_date": next_ex_date,
        "next_amount_per_share": next_amount,
        "history": history,
    }


def _estimate_next(history: list[tuple[date, float]]) -> tuple[date | None, float | None]:
    """Estimate the next ex-date + per-share amount from history cadence.

    Strategy: take the most recent ex-date, add the average gap between
    the last few ex-dates, and snap into the future. The estimated
    per-share amount is the most recent historical amount (the cleanest
    no-`.info` proxy — yfinance doesn't expose an authoritative forward
    payment until the company declares it, at which point the next ex-date
    typically appears in the dividend Series itself on the next refresh).

    Returns (None, None) when:
      - history is shorter than 2 payments
      - the inferred cadence is implausible (<10 days or >400 days)
      - the projected date is already more than one cadence in the past
    """
    if len(history) < 2:
        return None, None

    recent = history[-6:]
    spans = [
        (recent[i + 1][0] - recent[i][0]).days
        for i in range(len(recent) - 1)
        if (recent[i + 1][0] - recent[i][0]).days > 0
    ]
    if not spans:
        return None, None
    avg_span = int(round(sum(spans) / len(spans)))
    if avg_span < 10 or avg_span > 400:
        return None, None

    last_date, last_amt = history[-1]
    today = date.today()
    projected = last_date + timedelta(days=avg_span)
    # If still in the past, advance one more cadence (some names skip
    # quarters or pay irregularly; one advance is enough for SGX REITs).
    if projected < today:
        projected = projected + timedelta(days=avg_span)
    if projected < today:
        return None, None
    return projected, last_amt


# ── Compute ────────────────────────────────────────────────────────────────


def _compute_ttm(history: list[tuple[date, float]], today: date) -> tuple[float, list[tuple[date, float]]]:
    """Sum per-share amounts within rolling 365 days of `today`.
    Returns (ttm_per_share_native, [(date, per_share) ...] within window).
    """
    cutoff = today - _TTM_WINDOW
    within = [(d, amt) for d, amt in history if cutoff <= d <= today]
    return sum(amt for _, amt in within), within


def _build_holding(p: Any) -> HoldingDividend:
    """Build one HoldingDividend row off a Position from PortfolioSummary."""
    native_ccy = (p.currency or "?").upper()
    result = _fetch_one(p.code, native_ccy, p.name or "") or {
        "currency": native_ccy,
        "is_reit": False,
        "next_ex_date": None,
        "next_amount_per_share": None,
        "history": [],
    }

    today = date.today()
    history: list[tuple[date, float]] = result["history"]

    ttm_per_share, within = _compute_ttm(history, today)
    ttm_total_native = ttm_per_share * p.qty
    ttm_total_usd, _ = fx.convert(ttm_total_native, native_ccy, "USD")

    next_amount_total_usd: float | None = None
    if result["next_amount_per_share"] is not None:
        next_total_native = result["next_amount_per_share"] * p.qty
        next_amount_total_usd, _ = fx.convert(next_total_native, native_ccy, "USD")

    # Build the per-payment history list (most recent first, capped). USD
    # values for each row use today's spot, with a UI caveat.
    history_recent = list(reversed(history))[:_HISTORY_LIMIT]
    payments: list[DividendPayment] = []
    for d, amt in history_recent:
        total_native = amt * p.qty
        total_usd, _ = fx.convert(total_native, native_ccy, "USD")
        payments.append(
            DividendPayment(
                ex_date=d.isoformat(),
                amount_per_share_native=amt,
                amount_total_native=total_native,
                amount_total_usd=total_usd,
            )
        )

    next_ex_iso = (
        result["next_ex_date"].isoformat()
        if isinstance(result["next_ex_date"], date)
        else None
    )

    return HoldingDividend(
        code=p.code,
        ticker=p.ticker,
        name=p.name,
        currency=native_ccy,
        shares_held=p.qty,
        is_reit=result["is_reit"],
        next_ex_date=next_ex_iso,
        next_amount_per_share_native=result["next_amount_per_share"],
        next_amount_total_usd=next_amount_total_usd,
        ttm_per_share_native=ttm_per_share,
        ttm_total_native=ttm_total_native,
        ttm_total_usd=ttm_total_usd,
        history_count=len(within),
        history=payments,
    )


# ── Public API ──────────────────────────────────────────────────────────────


def get_portfolio() -> DividendsResponse:
    """Build the portfolio rollup. Per-row history is included on each
    item; the route also exposes a per-code endpoint for lazy fetches.
    """
    summary = get_summary()
    today = date.today()
    items = [_build_holding(p) for p in summary.positions]

    totals_ttm_usd = sum(i.ttm_total_usd for i in items)
    next_30d = today + timedelta(days=30)
    next_90d = today + timedelta(days=90)
    totals_next_30d = sum(
        (i.next_amount_total_usd or 0.0)
        for i in items
        if i.next_ex_date and date.fromisoformat(i.next_ex_date) <= next_30d
    )
    totals_next_90d = sum(
        (i.next_amount_total_usd or 0.0)
        for i in items
        if i.next_ex_date and date.fromisoformat(i.next_ex_date) <= next_90d
    )

    return DividendsResponse(
        as_of=datetime.now().isoformat(),
        items=items,
        totals_ttm_total_usd=totals_ttm_usd,
        totals_next_30d_total_usd=totals_next_30d,
        totals_next_90d_total_usd=totals_next_90d,
        rates_used=fx.rates_used_snapshot(),
    )


def get_one(code: str) -> HoldingDividend | None:
    """Per-holding history endpoint. Falls back to the portfolio query
    when the code isn't in the live book (lets watchlist surfaces opt
    in later without a separate code path).
    """
    summary = get_summary()
    for p in summary.positions:
        if p.code == code:
            return _build_holding(p)
    return None


def response_to_dict(r: DividendsResponse) -> dict:
    return {
        "as_of": r.as_of,
        "items": [holding_to_dict(i) for i in r.items],
        "totals": {
            "ttm_total_usd": r.totals_ttm_total_usd,
            "next_30d_total_usd": r.totals_next_30d_total_usd,
            "next_90d_total_usd": r.totals_next_90d_total_usd,
        },
        "rates_used": r.rates_used,
    }


def holding_to_dict(h: HoldingDividend) -> dict:
    d = asdict(h)
    return d

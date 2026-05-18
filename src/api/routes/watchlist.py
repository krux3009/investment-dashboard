"""GET /api/watchlist        — research-surface symbol list (fast).
GET /api/watchlist-mark/{code} — per-code earnings + ex-div marks (slow,
                                  yfinance-backed, 24h-cached).

Split into two endpoints so the list call stays fast even when the
yfinance backend is cold; the frontend fans out per-code marks in
parallel (same shape as /api/prices/{code}).

Resolution order for codes: MOOMOO_WATCHLIST env > moomoo user-security
group 'All' > hardcoded fallback. Mirrors v2's
`dashboard.views.watchlist._watchlist_codes()` exactly.
"""

from __future__ import annotations

import logging
import os
from datetime import date

from fastapi import APIRouter

from api import dividends, earnings
from api.models import WatchlistMark

log = logging.getLogger(__name__)

_DEFAULT_WATCHLIST = ["US.NVDA", "US.TSLA", "HK.00700"]
_CACHE: list[str] | None = None

# Market suffix → native currency. Seeds dividends._fetch_one for codes
# outside the live holdings book where moomoo Position.currency isn't
# available.
_MARKET_CURRENCY = {
    "US": "USD",
    "HK": "HKD",
    "SG": "SGD",
    "JP": "JPY",
    "CN": "CNH",
    "AU": "AUD",
    "MY": "MYR",
    "CA": "CAD",
}

router = APIRouter()


def _fetch_user_watchlist() -> list[str] | None:
    """Pull codes from a moomoo user-security group. None on failure."""
    group = os.environ.get("MOOMOO_WATCHLIST_GROUP", "All")
    try:
        from api.data import anomalies

        ret, data = anomalies._quote_ctx().get_user_security(group)  # noqa: SLF001
    except Exception as exc:
        log.warning("get_user_security(%s) exception: %s", group, exc)
        return None
    if ret != 0 or not hasattr(data, "iterrows") or len(data) == 0:
        return None
    return [str(row["code"]) for _, row in data.iterrows()]


def _watchlist_codes() -> list[str]:
    raw = os.environ.get("MOOMOO_WATCHLIST", "").strip()
    if raw:
        return [c.strip() for c in raw.split(",") if c.strip()]

    global _CACHE
    if _CACHE is None:
        fetched = _fetch_user_watchlist()
        if fetched:
            _CACHE = fetched
    if _CACHE:
        return _CACHE

    return _DEFAULT_WATCHLIST


def _market_ticker(code: str) -> tuple[str, str]:
    if "." in code:
        market, ticker = code.split(".", 1)
        return market.upper(), ticker
    return "?", code


@router.get("/watchlist")
def watchlist() -> dict:
    return {"codes": _watchlist_codes()}


@router.get("/watchlist-mark/{code}", response_model=WatchlistMark)
def watchlist_mark(code: str) -> WatchlistMark:
    today = date.today()
    market, ticker = _market_ticker(code)
    currency = _MARKET_CURRENCY.get(market, "USD")

    # Earnings — cached 24h via earnings_cache table.
    earnings_date: str | None = None
    earnings_days: int | None = None
    try:
        ep = earnings._fetch_one(code)  # noqa: SLF001
        if ep:
            earnings_date = ep["date"]
            earnings_days = (date.fromisoformat(earnings_date) - today).days
            if earnings_days < 0:
                earnings_date, earnings_days = None, None
    except Exception as exc:
        log.warning("earnings fetch failed for watchlist %s: %s", code, exc)

    # Ex-dividend projection — cached 24h via dividends_fetch_log. No
    # moomoo Position for arbitrary watchlist codes, so the REIT
    # heuristic only sees the ticker symbol as a name proxy.
    ex_date: str | None = None
    ex_days: int | None = None
    ex_amount: float | None = None
    ex_ccy: str | None = None
    try:
        dp = dividends._fetch_one(code, currency, ticker)  # noqa: SLF001
        if dp and dp.get("next_ex_date"):
            nd = dp["next_ex_date"]
            ex_iso = nd.isoformat() if hasattr(nd, "isoformat") else str(nd)
            days = (date.fromisoformat(ex_iso) - today).days
            if days >= 0:
                ex_date = ex_iso
                ex_days = days
                ex_amount = dp.get("next_amount_per_share")
                ex_ccy = dp.get("currency") or currency
    except Exception as exc:
        log.warning("dividends fetch failed for watchlist %s: %s", code, exc)

    return WatchlistMark(
        code=code,
        next_earnings_date=earnings_date,
        next_earnings_days_until=earnings_days,
        next_ex_date=ex_date,
        next_ex_days_until=ex_days,
        next_ex_amount_per_share=ex_amount,
        next_ex_currency=ex_ccy,
    )

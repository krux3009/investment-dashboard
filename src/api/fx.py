"""FX rates for converting native-currency market values to USD.

Uses yfinance spot quotes (`USDSGD=X`, `USDHKD=X`, ...). Cached in-process
with a 1h TTL — that's plenty for a single-user dashboard polling on a
30s cadence. Persistence (DuckDB) is deferred: prices.duckdb is held
exclusively by the Dash app process, and a 1h-TTL cache rebuilds in
~500ms per pair on cold start.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta

log = logging.getLogger(__name__)

_TTL = timedelta(hours=1)
_LOCK = threading.Lock()
_CACHE: dict[str, tuple[float, datetime]] = {}


def _yfinance_fetch(pair: str) -> float | None:
    """Fetch the most recent close for `<pair>=X` (e.g. USDSGD=X). Returns None on failure."""
    try:
        import yfinance as yf

        ticker = yf.Ticker(f"{pair}=X")
        df = ticker.history(period="1d", auto_adjust=False)
        if df is None or df.empty:
            log.warning("yfinance returned no rows for %s", pair)
            return None
        return float(df["Close"].iloc[-1])
    except Exception as exc:
        log.warning("yfinance fetch %s failed: %s", pair, exc)
        return None


def get_rate(pair: str) -> float | None:
    """`pair` like 'USDSGD' meaning 1 USD = N SGD. Returns None if unfetchable."""
    pair = pair.upper()
    now = datetime.now()
    with _LOCK:
        cached = _CACHE.get(pair)
        if cached and (now - cached[1]) < _TTL:
            return cached[0]

    rate = _yfinance_fetch(pair)
    if rate is None:
        return None
    with _LOCK:
        _CACHE[pair] = (rate, now)
    return rate


def convert(amount: float, from_ccy: str, to_ccy: str = "USD") -> tuple[float, str | None]:
    """Convert `amount` from `from_ccy` to `to_ccy`.

    Returns (converted_amount, pair_used). `pair_used` is None when no
    conversion was needed (same currency) or the rate was unfetchable
    (caller falls back to the native amount).
    """
    from_ccy = from_ccy.upper()
    to_ccy = to_ccy.upper()
    if from_ccy == to_ccy:
        return amount, None
    if from_ccy == "?" or to_ccy == "?":
        return amount, None

    # Direct quote: `<TO><FROM>` (e.g. USDSGD = SGD per USD).
    if to_ccy == "USD":
        pair = f"USD{from_ccy}"
        rate = get_rate(pair)
        if rate is None or rate == 0:
            log.warning("No FX rate for %s → USD; passing through", from_ccy)
            return amount, None
        return amount / rate, pair

    if from_ccy == "USD":
        pair = f"USD{to_ccy}"
        rate = get_rate(pair)
        if rate is None or rate == 0:
            return amount, None
        return amount * rate, pair

    # Cross-rate via USD.
    usd_amount, p1 = convert(amount, from_ccy, "USD")
    if p1 is None:
        return amount, None
    out_amount, p2 = convert(usd_amount, "USD", to_ccy)
    return out_amount, f"{p1}|{p2}" if p2 else None


def rates_used_snapshot() -> dict[str, float]:
    """Snapshot of currently-cached pair → rate (for response transparency)."""
    with _LOCK:
        return {pair: rate for pair, (rate, _) in _CACHE.items()}

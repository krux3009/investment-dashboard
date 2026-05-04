"""Tomorrow's preview — futures + Asia closes, a temperature read on
how the next US open might shape up.

Singapore is the dashboard's primary tz. Pre-market relevance is from
roughly SGT 17:00 (after Asia closes) through ~22:00 (just before US
open at SGT 21:30). Outside that window the data is stale; the
frontend dims the block but still renders it so the user can see when
the last update was.

Fetched live from yfinance via `Ticker.fast_info` (lighter than
`.info`, returns last_price + previous_close in one call). Cached
in-process for 5 minutes — preview data refreshes much more often than
digest/insight, so DuckDB is overkill.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

log = logging.getLogger(__name__)

_TTL = timedelta(minutes=5)
_LOCK = threading.Lock()
_CACHE: dict[str, tuple["PreviewRow", datetime]] = {}

# Preview symbols + their human labels. Ordered for display.
PreviewKind = Literal["us_futures", "asia_close"]

_SYMBOLS: list[tuple[str, str, PreviewKind]] = [
    ("ES=F", "S&P 500 futures", "us_futures"),
    ("NQ=F", "Nasdaq 100 futures", "us_futures"),
    ("^N225", "Nikkei 225 (Tokyo close)", "asia_close"),
    ("^HSI", "Hang Seng (Hong Kong close)", "asia_close"),
]


@dataclass(frozen=True)
class PreviewRow:
    symbol: str
    label: str
    kind: PreviewKind
    last_price: float
    previous_close: float
    change_pct: float


@dataclass(frozen=True)
class Preview:
    rows: list[PreviewRow]
    in_window: bool                       # True when SGT pre-market relevance applies
    fetched_at: datetime                  # timezone-aware UTC


# ── Fetch + cache ────────────────────────────────────────────────────────────


def _fetch_one(symbol: str, label: str, kind: PreviewKind) -> PreviewRow | None:
    """Cached single-symbol fetch via yfinance fast_info."""
    now = datetime.now(timezone.utc)
    with _LOCK:
        cached = _CACHE.get(symbol)
        if cached and (now - cached[1]) < _TTL:
            return cached[0]

    try:
        import yfinance as yf

        info = yf.Ticker(symbol).fast_info
        last = float(info.last_price)
        prev = float(info.previous_close)
    except Exception as exc:
        log.warning("preview fetch %s failed: %s", symbol, exc)
        return None

    if not prev:
        return None

    row = PreviewRow(
        symbol=symbol,
        label=label,
        kind=kind,
        last_price=last,
        previous_close=prev,
        change_pct=(last - prev) / prev,
    )
    with _LOCK:
        _CACHE[symbol] = (row, now)
    return row


# ── Window detection ────────────────────────────────────────────────────────


def _in_pre_market_window() -> bool:
    """SGT 17:00–22:00. Pre-market overlap with US open at SGT ~21:30.

    Outside this window the futures + Asia close data is stale (US
    market is mid-session or post-close).
    """
    try:
        from zoneinfo import ZoneInfo

        sgt = datetime.now(ZoneInfo("Asia/Singapore"))
    except Exception:
        # Should never happen on Python 3.9+ with system tz, but if it
        # does we degrade to "always show, never dim" rather than break
        # the endpoint.
        return True
    return 17 <= sgt.hour < 22


# ── Public API ──────────────────────────────────────────────────────────────


def get_preview() -> Preview:
    rows: list[PreviewRow] = []
    for symbol, label, kind in _SYMBOLS:
        row = _fetch_one(symbol, label, kind)
        if row is not None:
            rows.append(row)
    return Preview(
        rows=rows,
        in_window=_in_pre_market_window(),
        fetched_at=datetime.now(timezone.utc),
    )


def to_dict(p: Preview) -> dict:
    return {
        "rows": [asdict(r) for r in p.rows],
        "in_window": p.in_window,
        "fetched_at": p.fetched_at.isoformat(),
    }

"""Batch live-quote fetcher for non-position symbols (watchlist).

Wraps moomoo's `OpenQuoteContext.get_market_snapshot([codes])`. Held
positions already carry today_change_pct via the position snapshot
in moomoo_client; this module exists for the watchlist surface where
we don't have positions but still want today's intraday move.

Cache: 30-second TTL per code, in-memory dict. The watchlist page
fetches once on render; this guards against rapid client refreshes
hammering moomoo.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta

log = logging.getLogger(__name__)

_TTL = timedelta(seconds=30)
_LOCK = threading.Lock()
_CACHE: dict[str, tuple["Quote", datetime]] = {}

# Codes whose solo snapshot failed (e.g. no quote permission for that
# market). Skipped for _BAD_TTL so one dead code can't re-poison every
# batch and spam the log on each 20s tick.
_BAD_TTL = timedelta(minutes=10)
_BAD: dict[str, datetime] = {}


@dataclass(frozen=True)
class Quote:
    code: str
    last_price: float | None
    prev_close: float | None
    today_change_pct: float | None       # decimal, e.g. 0.0152 for +1.52%
    today_change_abs: float | None


def _from_row(row: dict) -> Quote:
    raw_last = row.get("last_price")
    raw_prev = row.get("prev_close_price")
    last = float(raw_last) if raw_last not in (None, 0) and raw_last == raw_last else None
    prev = float(raw_prev) if raw_prev not in (None, 0) and raw_prev == raw_prev else None
    abs_change = (last - prev) if (last is not None and prev is not None) else None
    pct = (abs_change / prev) if (abs_change is not None and prev) else None
    return Quote(
        code=str(row["code"]),
        last_price=last,
        prev_close=prev,
        today_change_pct=pct,
        today_change_abs=abs_change,
    )


def get_quotes(codes: list[str]) -> dict[str, Quote]:
    if not codes:
        return {}
    now = datetime.now()

    out: dict[str, Quote] = {}
    miss: list[str] = []
    with _LOCK:
        for c in codes:
            entry = _CACHE.get(c)
            if entry and (now - entry[1]) < _TTL:
                out[c] = entry[0]
            elif c in _BAD and (now - _BAD[c]) < _BAD_TTL:
                continue
            else:
                miss.append(c)

    if miss:
        frames = []
        ret, df = _snapshot(miss)
        if ret == 0 and df is not None and hasattr(df, "iterrows"):
            frames.append(df)
        else:
            # moomoo fails the whole batch when any one code is bad (e.g.
            # missing market quote permission) — retry per code to salvage
            # the rest, and bench the offenders.
            for c in miss:
                r, d = _snapshot([c]) if len(miss) > 1 else (ret, df)
                if r == 0 and d is not None and hasattr(d, "iterrows"):
                    frames.append(d)
                else:
                    _BAD[c] = now
                    log.warning(
                        "quote unavailable for %s — benched for %s", c, _BAD_TTL
                    )

        with _LOCK:
            for d in frames:
                for _, row in d.iterrows():
                    quote = _from_row(row.to_dict())
                    _CACHE[quote.code] = (quote, now)
                    out[quote.code] = quote

    return out


def _snapshot(codes: list[str]):
    from api.data import anomalies

    try:
        return anomalies.quote_ctx().get_market_snapshot(codes)
    except Exception as exc:
        log.warning("get_market_snapshot exception for %s: %s", codes, exc)
        return -1, None

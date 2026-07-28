"""GET /api/watchlist        — research-surface symbol list (fast).
GET /api/watchlist-mark/{code} — per-code earnings + ex-div marks (slow,
                                  yfinance-backed, 24h-cached).

Split into two endpoints so the list call stays fast even when the
yfinance backend is cold; the frontend fans out per-code marks in
parallel (same shape as /api/prices/{code}).

Thin adapter — the resolution + mark logic lives in `api.watchlist`.
"""

from __future__ import annotations

from fastapi import APIRouter

from api import watchlist as watchlist_domain
from api.models import WatchlistMark

router = APIRouter()


@router.get("/watchlist")
def watchlist() -> dict:
    return {"codes": watchlist_domain.watchlist_codes()}


@router.get("/watchlist-mark/{code}", response_model=WatchlistMark)
def watchlist_mark(code: str) -> WatchlistMark:
    return watchlist_domain.get_mark(code)

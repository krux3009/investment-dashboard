"""GET /api/watchlist — research-surface symbol list.

Resolution order: MOOMOO_WATCHLIST env > moomoo user-security group
'All' > hardcoded fallback. Mirrors v2's
`dashboard.views.watchlist._watchlist_codes()` exactly.

The route returns just codes; per-symbol price + sparkline data comes
from the existing /api/prices/{code} endpoint, which the frontend
fetches in parallel for every code.
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter

log = logging.getLogger(__name__)

_DEFAULT_WATCHLIST = ["US.NVDA", "US.TSLA", "HK.00700"]
_CACHE: list[str] | None = None

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


@router.get("/watchlist")
def watchlist() -> dict:
    return {"codes": _watchlist_codes()}

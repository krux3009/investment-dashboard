"""GET /api/earnings — upcoming earnings dates for current holdings.

Wraps api.earnings.get_all. Past dates are pruned in the module so this
endpoint returns only forward-looking entries, sorted by ascending
days_until. Tickers without yfinance coverage (some HK/SG) are silently
omitted; the route never errors on missing data.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from api import earnings

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/earnings")
def get_earnings() -> dict:
    items = [earnings.to_dict(e) for e in earnings.get_all()]
    next_within_14 = any(it["days_until"] <= 14 for it in items)
    return {"items": items, "next_within_14": next_within_14}

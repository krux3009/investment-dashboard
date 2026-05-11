"""GET /api/dividends — portfolio income ledger rollup.
GET /api/dividends/{code} — per-holding 8-quarter history.

Wraps api.dividends. yfinance gaps surface as 0-history rows rather
than errors so the UI can render a clean "No distributions on record."
state without separate error plumbing.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from api import dividends

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/dividends")
def get_dividends() -> dict:
    response = dividends.get_portfolio()
    return dividends.response_to_dict(response)


@router.get("/dividends/{code}")
def get_dividend_for(code: str) -> dict:
    holding = dividends.get_one(code)
    if holding is None:
        raise HTTPException(status_code=404, detail=f"no holding for code={code}")
    return dividends.holding_to_dict(holding)

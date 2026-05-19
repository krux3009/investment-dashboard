"""GET /api/portfolio/valuation | /pe-vs-market | /ps-vs-market | /peg-vs-market.

Wraps api.fair_value. Same 5s yfinance timeout caveat as portfolio_metrics
— gauges may return `portfolio: null` on first call before the cache
warms.
"""

from __future__ import annotations

from fastapi import APIRouter

from api import fair_value

router = APIRouter()


@router.get("/portfolio/valuation")
def get_valuation() -> dict:
    return fair_value.get_valuation()


@router.get("/portfolio/pe-vs-market")
def get_pe() -> dict:
    return fair_value.get_pe_vs_market()


@router.get("/portfolio/ps-vs-market")
def get_ps() -> dict:
    return fair_value.get_ps_vs_market()


@router.get("/portfolio/peg-vs-market")
def get_peg() -> dict:
    return fair_value.get_peg_vs_market()

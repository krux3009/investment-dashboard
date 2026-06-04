"""GET /api/portfolio/valuation | /pe-vs-market | /ps-vs-market | /peg-vs-market.

Wraps api.fair_value. Same 5s yfinance timeout caveat as portfolio_metrics
— gauges may return `portfolio: null` on first call before the cache
warms.
"""

from __future__ import annotations

from fastapi import APIRouter

from api import fair_value, fundamentals

router = APIRouter()


@router.get("/portfolio/valuation")
def get_valuation() -> dict:
    return fair_value.get_valuation()


# ── Analysis axis sub-tabs (v5): Future / Past / Health ───────────────────────
# Dividends axis reuses the existing /api/dividends* endpoints. Same first-call
# cache-warm caveat as the gauges — yfinance frames may be empty on cold cache.


@router.get("/portfolio/future")
def get_future() -> dict:
    return fundamentals.get_future()


@router.get("/portfolio/past")
def get_past() -> dict:
    return fundamentals.get_past()


@router.get("/portfolio/health")
def get_health() -> dict:
    return fundamentals.get_health()


@router.get("/portfolio/pe-vs-market")
def get_pe() -> dict:
    return fair_value.get_pe_vs_market()


@router.get("/portfolio/ps-vs-market")
def get_ps() -> dict:
    return fair_value.get_ps_vs_market()


@router.get("/portfolio/peg-vs-market")
def get_peg() -> dict:
    return fair_value.get_peg_vs_market()

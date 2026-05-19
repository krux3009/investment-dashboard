"""GET /api/portfolio/sectors | /geography | /top-holdings.

Wraps api.portfolio_metrics. yfinance Ticker.info gated by 5s timeout
in the module — endpoints may return empty/Unclassified buckets when
all holdings time out on first call. 24h cache warms subsequent reads.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from api import portfolio_metrics

router = APIRouter()


@router.get("/portfolio/sectors")
def get_sectors() -> list[dict]:
    return portfolio_metrics.get_sectors()


@router.get("/portfolio/geography")
def get_geography() -> list[dict]:
    return portfolio_metrics.get_geography()


@router.get("/portfolio/top-holdings")
def get_top_holdings(n: int = Query(10, ge=1, le=50)) -> list[dict]:
    return portfolio_metrics.get_top_holdings(n=n)

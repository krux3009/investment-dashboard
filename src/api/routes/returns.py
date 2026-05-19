"""GET /api/returns/summary | /detail | /contributors.

Pure aggregation; no Claude key required.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from api import returns

router = APIRouter()


@router.get("/returns/summary")
def get_summary() -> dict:
    return returns.summary_to_dict(returns.get_summary_returns())


@router.get("/returns/detail")
def get_detail() -> dict:
    return returns.detail_to_dict(returns.get_detail())


@router.get("/returns/contributors")
def get_contributors(n: int = Query(5, ge=1, le=20)) -> dict:
    return returns.contributors_to_dict(returns.get_contributors(n=n))

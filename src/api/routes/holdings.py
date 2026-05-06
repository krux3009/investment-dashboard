"""GET /api/holdings — live positions, USD-aggregated.

Reuses dashboard.data.moomoo_client.get_summary() verbatim (respects
MOOMOO_USE_DEMO + MOOMOO_TRD_ENV from .env). Aggregation lives in
api.holdings_payload so the realtime SSE broadcaster shares the
exact same math.
"""

from __future__ import annotations

from fastapi import APIRouter

from api.data.moomoo_client import get_summary
from api.holdings_payload import build_holdings_response
from api.models import HoldingsResponse

router = APIRouter()


@router.get("/holdings", response_model=HoldingsResponse)
def list_holdings() -> HoldingsResponse:
    return build_holdings_response(get_summary())

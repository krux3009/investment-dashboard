"""GET /api/concentration — portfolio shape ratios."""

from __future__ import annotations

from fastapi import APIRouter

from api import concentration
from api.models import ConcentrationResponse, TopName

router = APIRouter()


@router.get("/concentration", response_model=ConcentrationResponse)
def get_concentration() -> ConcentrationResponse:
    c = concentration.get_concentration()
    return ConcentrationResponse(
        count=c.count,
        total_market_value_usd=c.total_market_value_usd,
        top1_pct=c.top1_pct,
        top3_pct=c.top3_pct,
        top5_pct=c.top5_pct,
        top_names=[
            TopName(code=t.code, ticker=t.ticker, pct=t.pct) for t in c.top_names
        ],
        currency_exposure=c.currency_exposure,
        single_name_max=(
            TopName(
                code=c.single_name_max.code,
                ticker=c.single_name_max.ticker,
                pct=c.single_name_max.pct,
            )
            if c.single_name_max
            else None
        ),
    )

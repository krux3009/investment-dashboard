"""GET /api/quotes?codes=US.NVDA,HK.00700 — batch live snapshot."""

from __future__ import annotations

from fastapi import APIRouter, Query

from api.data import quotes
from api.models import Quote, QuotesResponse

router = APIRouter()


@router.get("/quotes", response_model=QuotesResponse)
def get_quotes(codes: str = Query(...)) -> QuotesResponse:
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    quote_map = quotes.get_quotes(code_list)
    return QuotesResponse(
        quotes={
            code: Quote(
                code=q.code,
                last_price=q.last_price,
                prev_close=q.prev_close,
                today_change_pct=q.today_change_pct,
                today_change_abs=q.today_change_abs,
            )
            for code, q in quote_map.items()
        }
    )

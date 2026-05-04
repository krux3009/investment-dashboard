"""GET /api/foresight — earnings + macro + company-events timeline."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from api import foresight
from api.models import ForesightEvent, ForesightResponse

router = APIRouter()


@router.get("/foresight", response_model=ForesightResponse)
def get_foresight(days: int = Query(7, ge=1, le=90)) -> ForesightResponse:
    events, held = foresight.get_foresight(days=days)
    return ForesightResponse(
        days=days,
        as_of=date.today().isoformat(),
        holdings_covered=held,
        events=[
            ForesightEvent(
                event_id=e.event_id,
                date=e.date,
                days_until=e.days_until,
                kind=e.kind,
                code=e.code,
                ticker=e.ticker,
                label=e.label,
                description=e.description,
            )
            for e in events
        ],
    )

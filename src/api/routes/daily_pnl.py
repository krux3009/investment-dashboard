"""GET /api/daily-pnl — close-to-close M2M + dividends paid per day."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from api import daily_pnl
from api.models import DailyPnlEntry, DailyPnlResponse

router = APIRouter()


@router.get("/daily-pnl", response_model=DailyPnlResponse)
def get_daily_pnl(
    start: date = Query(...),
    end: date = Query(...),
) -> DailyPnlResponse:
    if end < start:
        raise HTTPException(
            status_code=400, detail="`end` must be on or after `start`."
        )
    entries = daily_pnl.compute_daily_pnl(start=start, end=end)
    return DailyPnlResponse(
        start=start.isoformat(),
        end=end.isoformat(),
        as_of=date.today().isoformat(),
        entries=[
            DailyPnlEntry(
                date=e.date,
                pnl_usd=e.pnl_usd,
                pnl_pct=e.pnl_pct,
                value_usd=e.value_usd,
            )
            for e in entries
        ],
    )

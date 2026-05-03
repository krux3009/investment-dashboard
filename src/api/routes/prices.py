"""GET /api/prices/{code} — daily-bar history for sparklines + drill-in chart.

Reuses dashboard.data.prices.get_history (DuckDB-cached, two-day-stale
backfill rule, _UNFETCHABLE-aware).
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from api.prices import get_history

router = APIRouter()


@router.get("/prices/{code:path}")
def price_history(
    code: str,
    days: int = Query(30, ge=1, le=365),
) -> dict:
    """Return chronological close-series + dates for a symbol.

    Response shape: `{code, days, points: [{date: "YYYY-MM-DD", close: float}, ...]}`.
    Empty `points` means cache + fetch produced nothing (likely
    SG.K71U-style "Unknown stock" or an unsubscribed market).
    """
    df = get_history(code, days=days)
    if df.empty:
        return {"code": code, "days": days, "points": []}

    points = [
        {
            "date": row["date"].isoformat() if hasattr(row["date"], "isoformat") else str(row["date"]),
            "close": float(row["close"]),
        }
        for _, row in df.iterrows()
    ]
    return {"code": code, "days": days, "points": points}

"""GET /api/foresight-insight/{event_id} — three-line What/Meaning/Watch."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import foresight_insight

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/foresight-insight/{event_id:path}")
def get_foresight_insight(
    event_id: str,
    days: int = Query(30, ge=1, le=90),
    refresh: bool = Query(False),
) -> dict:
    try:
        ins = foresight_insight.get_insight(event_id, days=days, force_refresh=refresh)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("foresight insight failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if ins is None:
        raise HTTPException(status_code=404, detail="event not in the current foresight window")
    return {
        "event_id": ins.event_id,
        "what": ins.what,
        "meaning": ins.meaning,
        "watch": ins.watch,
        "generated_at": ins.generated_at.isoformat(),
        "cached": ins.cached,
    }

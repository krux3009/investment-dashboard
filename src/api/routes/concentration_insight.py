"""GET /api/concentration-insight — advisor commentary on shape."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import concentration_insight

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/concentration-insight")
def get_concentration_insight(refresh: bool = Query(False)) -> dict:
    try:
        ins = concentration_insight.get_insight(force_refresh=refresh)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("concentration insight failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if ins is None:
        raise HTTPException(status_code=404, detail="no holdings to summarize")
    return {
        "what": ins.what,
        "meaning": ins.meaning,
        "watch": ins.watch,
        "generated_at": ins.generated_at.isoformat(),
        "cached": ins.cached,
    }

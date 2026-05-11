"""GET /api/dividends-insight — advisor commentary on the income ledger."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import dividends_insight
from api.i18n import parse_locale

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/dividends-insight")
def get_dividends_insight(
    refresh: bool = Query(False),
    locale: str = Query("en"),
) -> dict:
    loc = parse_locale(locale)
    try:
        ins = dividends_insight.get_insight(force_refresh=refresh, locale=loc)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("dividends insight failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if ins is None:
        raise HTTPException(status_code=404, detail="no distributions to summarize")
    return {
        "what": ins.what,
        "meaning": ins.meaning,
        "watch": ins.watch,
        "generated_at": ins.generated_at.isoformat(),
        "cached": ins.cached,
    }

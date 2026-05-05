"""GET /api/insight/{code}: per-stock Meaning + Watch lines.

Wraps api.insight.get_insight. Returns 503 if ANTHROPIC_API_KEY is
missing so the drill-in can render a quiet "configure API key" hint
instead of erroring out. Returns 200 with empty `meaning` / `watch`
when the code isn't a current holding so the watchlist drill-in
doesn't log a console error for every non-held name.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import insight

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/insight/{code:path}")
def get_insight(code: str, refresh: bool = Query(False)) -> dict:
    try:
        ins = insight.get_insight(code, force_refresh=refresh)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("insight generation failed for %s", code)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if ins is None:
        return {
            "code": code,
            "ticker": code.split(".", 1)[-1],
            "meaning": "",
            "watch": "",
            "generated_at": "",
            "cached": False,
            "available": False,
        }

    return {
        "code": ins.code,
        "ticker": ins.ticker,
        "meaning": ins.meaning,
        "watch": ins.watch,
        "generated_at": ins.generated_at.isoformat(),
        "cached": ins.cached,
        "available": True,
    }

"""GET /api/earnings-insight/{code} — per-report educational lines.

Wraps api.earnings_insight.get_earnings_insight. Returns 503 if
ANTHROPIC_API_KEY is missing so the strip can render a quiet "set
API key" hint inline. Returns 404 if `code` has no upcoming earnings
record (rare — the strip only renders learn-more for codes that do).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import earnings_insight

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/earnings-insight/{code:path}")
def get_earnings_insight(code: str, refresh: bool = Query(False)) -> dict:
    try:
        ins = earnings_insight.get_earnings_insight(code, force_refresh=refresh)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("earnings-insight generation failed for %s", code)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if ins is None:
        raise HTTPException(
            status_code=404,
            detail=f"no upcoming earnings record for {code}",
        )

    return {
        "code": ins.code,
        "ticker": ins.ticker,
        "what": ins.what,
        "meaning": ins.meaning,
        "watch": ins.watch,
        "generated_at": ins.generated_at.isoformat(),
        "cached": ins.cached,
    }

"""GET /api/digest — AI-generated daily digest of the portfolio.

Wraps api.digest.get_digest. Returns 503 if ANTHROPIC_API_KEY is missing
so the dashboard can render a graceful "configure API key" hint instead
of erroring out.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import digest

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/digest")
def get_digest(refresh: bool = Query(False)) -> dict:
    try:
        d = digest.get_digest(force_refresh=refresh)
    except RuntimeError as exc:
        # Most likely: ANTHROPIC_API_KEY missing.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("digest generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "prose": d.prose,
        "generated_at": d.generated_at.isoformat(),
        "holdings_covered": list(d.holdings_covered),
        "cached": d.cached,
    }

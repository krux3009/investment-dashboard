"""GET /api/preview-insight/{symbol} — per-symbol What/Meaning/Watch.

503 if ANTHROPIC_API_KEY is missing. 404 if symbol isn't one of the
preview-supported symbols.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import preview_insight

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/preview-insight/{symbol:path}")
def get_preview_insight(symbol: str, refresh: bool = Query(False)) -> dict:
    try:
        ins = preview_insight.get_preview_insight(symbol, force_refresh=refresh)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("preview-insight generation failed for %s", symbol)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if ins is None:
        raise HTTPException(
            status_code=404,
            detail=f"{symbol} is not a supported preview symbol",
        )

    return {
        "symbol": ins.symbol,
        "label": ins.label,
        "what": ins.what,
        "meaning": ins.meaning,
        "watch": ins.watch,
        "generated_at": ins.generated_at.isoformat(),
        "cached": ins.cached,
    }

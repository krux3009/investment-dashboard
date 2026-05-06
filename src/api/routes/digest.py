"""GET /api/digest — per-ticker analyst-tile grid.

Wraps `api.digest.get_digest_async` (4 analyst tiles per holding,
asyncio.gather, semaphore-bounded). Returns 503 if `ANTHROPIC_API_KEY`
is missing so the dashboard renders a quiet hint instead of erroring.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import digest

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/digest")
async def get_digest(refresh: bool = Query(False)) -> dict:
    try:
        d = await digest.get_digest_async(force_refresh=refresh)
    except RuntimeError as exc:
        # Most likely: ANTHROPIC_API_KEY missing.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("digest generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "generated_at": d.generated_at.isoformat(),
        "cached": d.cached,
        "holdings": [
            {
                "code": t.code,
                "ticker": t.ticker,
                "name": t.name,
                "fundamentals": t.fundamentals,
                "news": t.news,
                "sentiment": t.sentiment,
                "technical": t.technical,
            }
            for t in d.holdings
        ],
    }

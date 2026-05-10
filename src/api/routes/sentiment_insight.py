"""GET /api/sentiment-insight/{code}: three-line What/Meaning/Watch.

Lazy-fetched behind the [learn more] toggle on the SentimentBlock
drill-in. 503 when Anthropic key is missing. 200 with `available: false`
when there's nothing to interpret (zero mentions in the 7-day window).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import sentiment_insight
from api.i18n import parse_locale

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/sentiment-insight/{code:path}")
def get_sentiment_insight(
    code: str,
    refresh: bool = Query(False),
    locale: str = Query("en"),
) -> dict:
    loc = parse_locale(locale)
    try:
        ins = sentiment_insight.get_insight(code, force_refresh=refresh, locale=loc)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("sentiment-insight failed for %s", code)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if ins is None:
        return {
            "code": code,
            "what": "",
            "meaning": "",
            "watch": "",
            "generated_at": "",
            "cached": False,
            "available": False,
        }

    return {
        "code": ins.code,
        "what": ins.what,
        "meaning": ins.meaning,
        "watch": ins.watch,
        "generated_at": ins.generated_at.isoformat(),
        "cached": ins.cached,
        "available": True,
    }

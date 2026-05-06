"""GET /api/reddit/{code}: Reddit-discussion snapshot for one ticker.

Returns counts by sentiment bucket, a weighted score in [-1, +1], and
up to three representative posts (top score per bucket). 503 when
Reddit creds are missing AND no cache exists. 200 with `total_mentions: 0`
when posts genuinely aren't there.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import reddit_sentiment

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/reddit/{code:path}")
def get_reddit(code: str, days: int = Query(7, ge=1, le=14)) -> dict:
    ticker = code.split(".", 1)[-1]
    try:
        mentions = reddit_sentiment.fetch_mentions(code, ticker, days=days)
    except reddit_sentiment.RedditNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("reddit fetch failed for %s", code)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    summary = reddit_sentiment.aggregate(code, mentions, days=days)
    return {
        "code": code,
        "days": summary.days,
        "total_mentions": summary.total_mentions,
        "buckets": summary.buckets,
        "weighted_score": summary.weighted_score,
        "top_mentions": [
            {
                "subreddit": m.subreddit,
                "post_id": m.post_id,
                "title": m.title,
                "url": m.url,
                "score": m.score,
                "num_comments": m.num_comments,
                "classification": m.classification,
            }
            for m in summary.top_mentions
        ],
        "as_of": summary.as_of.isoformat(),
    }

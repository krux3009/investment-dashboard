"""Sentiment analyst tile.

Context = aggregated Reddit-discussion summary (counts + weighted score
+ top representative posts) from `reddit_sentiment.fetch_mentions +
aggregate`. Sentiment-as-signal words are forbidden ("FOMO", "panic",
"capitulation", "euphoric", "meme") on top of the base + bull/bear bans.

When the public-JSON fetch returns zero mentions across the searched
subs, the tile short-circuits to the quiet fallback rather than asking
Claude to write about nothing.
"""

from __future__ import annotations

import logging

from api import reddit_sentiment
from api.analysts._base import AnalystOutput, call_analyst, _quiet
from api.i18n import Locale

log = logging.getLogger(__name__)

ROLE = "Sentiment"
ROLE_BANS: dict[Locale, tuple[str, ...]] = {
    "en": ("FOMO", "panic", "capitulation", "euphoric", "meme"),
    "zh": ("恐慌", "投降", "狂热", "迷因", "踏空"),
}


def _build_context(code: str, ticker: str) -> dict | None:
    try:
        mentions = reddit_sentiment.fetch_mentions(code, ticker, days=7)
    except Exception as exc:
        log.debug("reddit fetch failed for %s/%s: %s", code, ticker, exc)
        return None
    if not mentions:
        return None
    summary = reddit_sentiment.aggregate(code, mentions, days=7)
    return {
        "ticker": ticker,
        "total_mentions": summary.total_mentions,
        "buckets": summary.buckets,
        "weighted_score": round(summary.weighted_score, 2),
        "representative_titles": [m.title[:120] for m in summary.top_mentions],
    }


def get_take(code: str, ticker: str, name: str, locale: Locale = "en") -> AnalystOutput:
    context = _build_context(code, ticker)
    if context is None:
        return _quiet(ROLE, locale)
    return call_analyst(
        role=ROLE,
        ticker=ticker,
        name=name,
        context=context,
        role_specific_bans=ROLE_BANS,
        is_context_empty=False,
        locale=locale,
    )

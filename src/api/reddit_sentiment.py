"""Reddit-discussion ingestor + VADER classifier + aggregator.

Pulls posts mentioning a ticker via praw across a curated set of finance
subreddits, classifies each via VADER (rule-based, not LLM), and folds
the result into a `SentimentSummary` the drill-in panel can render.

A 24h DuckDB cache (`data/reddit_cache.py`) sits between this module and
the live Reddit API: a second hit for the same `code` within 24h serves
without praw traffic. Posts age out of the 7-day rolling window via
`created_utc`, not the cache row's `fetched_at`, so old cached posts
disappear cleanly even between fetches.

Educational framing only. This module does NOT generate prose; it
prepares structured data. The optional `What/Meaning/Watch` advisor lives
in `sentiment_insight.py` and reads from `aggregate()`.

Returns 503-shaped surfaces when `REDDIT_CLIENT_ID` is unset — the
`fetch_mentions` caller can then translate the `RedditNotConfigured`
exception to an HTTP 503 in the route.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from api.data import reddit_cache
from api.data.reddit_cache import Classification, Mention

if TYPE_CHECKING:
    import praw

log = logging.getLogger(__name__)

_CACHE_TTL = timedelta(hours=24)

# Curated finance / investing subreddits searched for every ticker.
# Stocks-only; deliberately excludes r/cryptocurrency and r/personalfinance.
_GLOBAL_SUBS = ("stocks", "investing", "wallstreetbets", "SecurityAnalysis")

# Per-ticker subreddits are tried in priority order. Most don't exist;
# praw raises Redirect / NotFound which we swallow silently. The point
# is to surface ticker-native discussion (r/NVDA_Stock, r/TSLA) when it
# does exist without forcing a hardcoded map.
_TICKER_SUB_TEMPLATES = ("{ticker}", "{ticker}_Stock", "{ticker}stocks")

# VADER thresholds per plan; keep symmetric.
_POSITIVE_THRESHOLD = 0.05
_NEGATIVE_THRESHOLD = -0.05


class RedditNotConfigured(RuntimeError):
    """Raised when REDDIT_CLIENT_ID / SECRET / USER_AGENT are missing."""


# ── Models ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SentimentSummary:
    code: str
    days: int
    total_mentions: int
    buckets: dict[str, int]          # {"positive": N, "neutral": N, "negative": N}
    weighted_score: float            # sum(score * sign) / sum(|score|), in [-1, 1]
    top_mentions: list[Mention]      # ≤3 representative — top score per bucket
    as_of: datetime


# ── praw client ─────────────────────────────────────────────────────────────


def _init_reddit() -> "praw.Reddit | None":
    client_id = os.environ.get("REDDIT_CLIENT_ID")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET")
    user_agent = os.environ.get("REDDIT_USER_AGENT")
    if not (client_id and client_secret and user_agent):
        return None
    import praw

    return praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent=user_agent,
        check_for_async=False,
    )


# ── VADER classifier ────────────────────────────────────────────────────────

_VADER = None


def _vader():
    global _VADER
    if _VADER is None:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

        _VADER = SentimentIntensityAnalyzer()
    return _VADER


def classify(text: str) -> Classification:
    """Bucket text into positive / neutral / negative using VADER compound."""
    if not text:
        return "neutral"
    compound = _vader().polarity_scores(text)["compound"]
    if compound > _POSITIVE_THRESHOLD:
        return "positive"
    if compound < _NEGATIVE_THRESHOLD:
        return "negative"
    return "neutral"


# ── Fetch ───────────────────────────────────────────────────────────────────


def _candidate_subs(ticker: str) -> list[str]:
    """Subreddit names to search for `ticker`, in priority order."""
    out: list[str] = list(_GLOBAL_SUBS)
    for tpl in _TICKER_SUB_TEMPLATES:
        out.append(tpl.format(ticker=ticker))
    return out


def _post_to_mention(
    code: str,
    post,  # praw.models.Submission
    sub_name: str,
    fetched_at: datetime,
) -> Mention:
    title = post.title or ""
    body = (post.selftext or "")[:500]
    text = f"{title} {body}".strip()
    return Mention(
        code=code,
        subreddit=sub_name,
        post_id=post.id,
        title=title,
        body=body,
        url=f"https://reddit.com{post.permalink}",
        score=int(getattr(post, "score", 0) or 0),
        num_comments=int(getattr(post, "num_comments", 0) or 0),
        classification=classify(text),
        created_at=datetime.fromtimestamp(getattr(post, "created_utc", 0)),
        fetched_at=fetched_at,
    )


def fetch_mentions(code: str, ticker: str, days: int = 7) -> list[Mention]:
    """Return mentions of `ticker` over the trailing `days`.

    Cache-first: if any row for `code` was fetched within the 24h TTL,
    return cached rows filtered to the rolling window. Otherwise hit
    praw across the global + per-ticker subreddit set, persist, and
    return.

    Raises `RedditNotConfigured` when `REDDIT_CLIENT_ID` is missing AND
    no cache exists. With cache, returns stale-but-classified rows so
    the panel keeps working when creds are pulled mid-session.
    """
    last_fetched = reddit_cache.latest_fetched_at(code)
    if last_fetched and (datetime.now() - last_fetched) < _CACHE_TTL:
        return reddit_cache.get_recent(code, days=days)

    reddit = _init_reddit()
    if reddit is None:
        if last_fetched is not None:
            return reddit_cache.get_recent(code, days=days)
        raise RedditNotConfigured(
            "Reddit not configured — set REDDIT_CLIENT_ID / "
            "REDDIT_CLIENT_SECRET / REDDIT_USER_AGENT in .env."
        )

    fetched_at = datetime.now()
    cutoff = fetched_at - timedelta(days=days)
    seen: dict[str, Mention] = {}

    for sub_name in _candidate_subs(ticker):
        try:
            subreddit = reddit.subreddit(sub_name)
            results = subreddit.search(
                f'"{ticker}"',
                sort="new",
                time_filter="week",
                limit=25,
            )
            for post in results:
                created_utc = getattr(post, "created_utc", 0)
                if not created_utc:
                    continue
                if datetime.fromtimestamp(created_utc) < cutoff:
                    continue
                if post.id in seen:
                    continue
                seen[post.id] = _post_to_mention(
                    code, post, sub_name, fetched_at
                )
        except Exception as exc:
            # Subreddit doesn't exist (404), is private (403), is
            # quarantined, rate-limited, etc. Quiet skip — the global
            # subs cover the floor.
            log.debug("reddit search %s for %s skipped: %s", sub_name, ticker, exc)
            continue

    mentions = list(seen.values())
    reddit_cache.put_batch(mentions)
    return mentions


# ── Aggregate ───────────────────────────────────────────────────────────────


def _sign(c: Classification) -> int:
    if c == "positive":
        return 1
    if c == "negative":
        return -1
    return 0


def _top_per_bucket(mentions: list[Mention]) -> list[Mention]:
    """Pick one representative per bucket: highest-score post in each.

    Diversity over volume — the bar already shows counts; the post list
    earns its space by surfacing the spread, not the loudest end. Empty
    buckets drop their slot. Result has ≤3 items.
    """
    by_bucket: dict[str, Mention] = {}
    for m in mentions:
        existing = by_bucket.get(m.classification)
        if existing is None or m.score > existing.score:
            by_bucket[m.classification] = m
    ordered: list[Mention] = []
    for bucket in ("positive", "neutral", "negative"):
        if bucket in by_bucket:
            ordered.append(by_bucket[bucket])
    return ordered


def aggregate(code: str, mentions: list[Mention], days: int = 7) -> SentimentSummary:
    """Pure aggregation: counts, weighted score, top-3 selection."""
    buckets = {"positive": 0, "neutral": 0, "negative": 0}
    weighted_num = 0.0
    abs_score_sum = 0.0
    for m in mentions:
        buckets[m.classification] += 1
        sign = _sign(m.classification)
        weighted_num += m.score * sign
        abs_score_sum += abs(m.score)
    weighted_score = (
        weighted_num / abs_score_sum if abs_score_sum > 0 else 0.0
    )
    return SentimentSummary(
        code=code,
        days=days,
        total_mentions=len(mentions),
        buckets=buckets,
        weighted_score=weighted_score,
        top_mentions=_top_per_bucket(mentions),
        as_of=datetime.now(),
    )

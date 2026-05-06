"""Reddit-discussion ingestor + VADER classifier + aggregator.

Fetches posts mentioning a ticker via Reddit's **public JSON endpoints**
(no auth, no API key — just append `.json` to any subreddit URL).
Reddit's November 2025 Responsible Builder Policy gates new OAuth keys
behind a manual review queue, but the public read-only JSON endpoints
remain unauthenticated; ~60 req/min for User-Agent-identifying clients.

Each post's title + first 500 chars of body get classified via VADER
(rule-based, not LLM) into positive / neutral / negative buckets.

A 24h DuckDB cache (`data/reddit_cache.py`) sits between this module
and live Reddit: a second hit for the same `code` within 24h serves
from cache. Posts age out of the 7-day rolling window via `created_utc`,
not `fetched_at`, so old cached posts disappear cleanly between fetches.

Educational framing only. This module does NOT generate prose; it
prepares structured data. The optional What/Meaning/Watch advisor lives
in `sentiment_insight.py` and reads from `aggregate()`.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta

from api.data import reddit_cache
from api.data.reddit_cache import Classification, Mention

log = logging.getLogger(__name__)

_CACHE_TTL = timedelta(hours=24)

# Curated finance / investing subreddits searched for every ticker.
# Stocks-only; deliberately excludes r/cryptocurrency and r/personalfinance.
_GLOBAL_SUBS = ("stocks", "investing", "wallstreetbets", "SecurityAnalysis")

# Per-ticker subreddits are tried in priority order. Most don't exist;
# Reddit returns an empty Listing or 404 which we swallow silently.
_TICKER_SUB_TEMPLATES = ("{ticker}", "{ticker}_Stock", "{ticker}stocks")

# VADER thresholds per plan; keep symmetric.
_POSITIVE_THRESHOLD = 0.05
_NEGATIVE_THRESHOLD = -0.05

# Default User-Agent. Reddit asks UAs identify the app + operator, but
# any descriptive UA works for unauth read-only access. Override via
# REDDIT_USER_AGENT env var when running.
_DEFAULT_USER_AGENT = "investment-dashboard/0.1 (long-horizon personal dashboard)"

# Conservative inter-request delay to keep us well under Reddit's
# unauth ~60 req/min ceiling. Sequential, not concurrent — the cache
# absorbs cost on second-and-beyond opens.
_REQUEST_DELAY_SECONDS = 1.1
_REQUEST_TIMEOUT_SECONDS = 10


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


# ── HTTP fetch (public JSON, no auth) ───────────────────────────────────────


def _user_agent() -> str:
    return os.environ.get("REDDIT_USER_AGENT") or _DEFAULT_USER_AGENT


def _search_url(subreddit: str, ticker: str) -> str:
    qs = urllib.parse.urlencode(
        {
            "q": f'"{ticker}"',
            "restrict_sr": "1",
            "sort": "new",
            "t": "week",
            "limit": 25,
        }
    )
    return f"https://www.reddit.com/r/{subreddit}/search.json?{qs}"


def _http_get_json(url: str) -> dict | None:
    """GET + JSON parse. Returns None on any HTTP / parse error.

    We swallow rather than raise: subreddit doesn't exist (404),
    quarantined (403), private (403), rate-limited (429), or transient
    network issue all mean "skip this sub, the others cover the floor".
    The route's outer 500 handler catches truly catastrophic failures.
    """
    req = urllib.request.Request(
        url,
        headers={"User-Agent": _user_agent(), "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_REQUEST_TIMEOUT_SECONDS) as resp:
            body = resp.read()
    except urllib.error.HTTPError as exc:
        log.debug("reddit GET %s -> HTTP %s", url, exc.code)
        return None
    except (urllib.error.URLError, TimeoutError) as exc:
        log.debug("reddit GET %s -> network error: %s", url, exc)
        return None
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        log.warning("reddit GET %s returned non-JSON: %s", url, exc)
        return None


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


def _post_data_to_mention(
    code: str,
    sub_name: str,
    post_data: dict,
    fetched_at: datetime,
) -> Mention | None:
    post_id = post_data.get("id")
    if not post_id:
        return None
    title = post_data.get("title") or ""
    body = (post_data.get("selftext") or "")[:500]
    text = f"{title} {body}".strip()
    permalink = post_data.get("permalink") or ""
    created_utc = post_data.get("created_utc") or 0
    return Mention(
        code=code,
        subreddit=post_data.get("subreddit") or sub_name,
        post_id=post_id,
        title=title,
        body=body,
        url=f"https://reddit.com{permalink}" if permalink else "",
        score=int(post_data.get("score") or 0),
        num_comments=int(post_data.get("num_comments") or 0),
        classification=classify(text),
        created_at=datetime.fromtimestamp(created_utc) if created_utc else datetime.now(),
        fetched_at=fetched_at,
    )


def fetch_mentions(code: str, ticker: str, days: int = 7) -> list[Mention]:
    """Return mentions of `ticker` over the trailing `days`.

    Cache-first: if any row for `code` was fetched within the 24h TTL,
    return cached rows filtered to the rolling window. Otherwise hit
    Reddit's public JSON across the global + per-ticker subreddit set,
    persist, and return.

    No exception is raised on missing creds — the public JSON endpoint
    needs none. Network / rate-limit failures fall through to whatever
    cache exists; if cache is empty too, returns [].
    """
    last_fetched = reddit_cache.latest_fetched_at(code)
    if last_fetched and (datetime.now() - last_fetched) < _CACHE_TTL:
        return reddit_cache.get_recent(code, days=days)

    fetched_at = datetime.now()
    cutoff = fetched_at - timedelta(days=days)
    seen: dict[str, Mention] = {}

    for i, sub_name in enumerate(_candidate_subs(ticker)):
        if i > 0:
            time.sleep(_REQUEST_DELAY_SECONDS)
        payload = _http_get_json(_search_url(sub_name, ticker))
        if not payload:
            continue
        children = payload.get("data", {}).get("children", []) or []
        for child in children:
            post_data = child.get("data") or {}
            if post_data.get("kind") and post_data.get("kind") != "t3":
                continue
            created_utc = post_data.get("created_utc") or 0
            if not created_utc:
                continue
            if datetime.fromtimestamp(created_utc) < cutoff:
                continue
            mention = _post_data_to_mention(code, sub_name, post_data, fetched_at)
            if mention is None or mention.post_id in seen:
                continue
            seen[mention.post_id] = mention

    mentions = list(seen.values())
    reddit_cache.put_batch(mentions)
    if not mentions and last_fetched is not None:
        # Network failed across every sub — fall back to whatever stale
        # cache we have rather than render empty.
        return reddit_cache.get_recent(code, days=days)
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

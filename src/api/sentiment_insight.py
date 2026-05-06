"""Per-stock sentiment advisor — three short lines (What / Meaning / Watch).

Lazy-fetched behind the [learn more] toggle inside the SentimentBlock
drill-in panel. Reads `reddit_sentiment.aggregate()` for structured
context, asks Claude for three observation-only sentences, caches in
DuckDB on `(code, _PROMPT_VERSION)` with a 6h TTL — same cadence as
the other insights.

Educational framing rules verbatim from `digest.py` plus sentiment-
specific bans (bullish, bearish, FOMO, panic, capitulation, euphoric)
per `feedback_financial_framing.md`. The "Watch" line names an
observation target; never an action.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import reddit_sentiment
from api.data import prices
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
_PROMPT_VERSION = "v1"

_PROMPT = """\
You are summarising Reddit discussion volume and tone for ONE stock,
over the past 7 days, for a long-horizon student investor. The reader
already sees the post counts and a small bar chart; this is the deeper
plain-English context.

Output format, exact and machine-parsed, three lines:

What: <one sentence on volume + tone in plain words.>
Meaning: <one sentence on what this signals to someone who already owns
          this stock; observation only, never directional.>
Watch: <one sentence naming what to observe as discussion shifts; an
        observation target, never an action.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- NEVER use em dashes (—). Use colons, commas, or periods instead.

NEVER use these action words:
  buy / sell / hold / trim / add / target / forecast / predict / expect /
  recommend / "you should" / "you ought" / "consider [verb]" / "tomorrow".

NEVER use these hype words:
  surge / plunge / soar / crash / breakout / rally / tank.

NEVER use these sentiment-as-signal words:
  bullish / bearish / FOMO / panic / capitulation / euphoric / meme.

Translate concepts. Don't say "sentiment is positive" — say "more posts
read favourably than not". Don't say "negative tone" — say "discussion
leans cautious". Frame everything as observation about the discussion
itself, not about price.

Tone: matter-of-fact, calm, considered. Like a patient teacher writing
one note in a personal ledger.

Output the three lines only. No preamble, no markdown, no bullets.
"""


@dataclass(frozen=True)
class SentimentInsight:
    code: str
    what: str
    meaning: str
    watch: str
    generated_at: datetime
    cached: bool = False


# ── Cache ────────────────────────────────────────────────────────────────────


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS sentiment_insight_cache (
                code VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                what VARCHAR,
                meaning VARCHAR,
                watch VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (code, prompt_version)
            )
            """
        )


def _load_cached(code: str) -> SentimentInsight | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM sentiment_insight_cache "
            "WHERE code = ? AND prompt_version = ?",
            [code, _PROMPT_VERSION],
        ).fetchone()
    if not row:
        return None
    what, meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return SentimentInsight(
        code=code,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=generated_at,
        cached=True,
    )


def _save_cache(insight: SentimentInsight) -> None:
    _ensure_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO sentiment_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [
                insight.code,
                _PROMPT_VERSION,
                insight.what,
                insight.meaning,
                insight.watch,
                insight.generated_at,
            ],
        )


# ── Context + Claude ────────────────────────────────────────────────────────


def _resolve_name(code: str) -> str:
    """Best-effort name lookup. Falls back to the bare ticker when the
    code isn't in the live book (watchlist names with no quote subscription).
    """
    try:
        summary = get_summary()
        for p in summary.positions:
            if p.code == code:
                return p.name or p.ticker
    except Exception:
        pass
    return code.split(".", 1)[-1]


def _build_user_message(code: str, summary: reddit_sentiment.SentimentSummary, name: str) -> str:
    ticker = code.split(".", 1)[-1]
    lines = [
        f"Stock: {ticker} ({code}, {name})",
        f"Window: past {summary.days} days",
        f"Total mentions: {summary.total_mentions}",
        (
            f"Buckets: {summary.buckets['positive']} positive · "
            f"{summary.buckets['neutral']} neutral · "
            f"{summary.buckets['negative']} negative"
        ),
        f"Weighted score (-1 to +1): {summary.weighted_score:+.2f}",
    ]
    if summary.top_mentions:
        lines.append("Representative posts:")
        for m in summary.top_mentions:
            lines.append(
                f"  - r/{m.subreddit} · {m.classification} · {m.score} upvotes · "
                f"\"{m.title[:120]}\""
            )
    return "\n".join(lines)


def _call_claude(user_message: str) -> tuple[str, str, str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/sentiment-insight."
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")

    response = client.messages.create(
        model=model,
        max_tokens=320,
        system=_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    body = "\n".join(b.text for b in response.content if b.type == "text").strip()

    what = meaning = watch = ""
    for line in body.splitlines():
        line = line.strip()
        lower = line.lower()
        if lower.startswith("what:"):
            what = line.split(":", 1)[1].strip()
        elif lower.startswith("meaning:"):
            meaning = line.split(":", 1)[1].strip()
        elif lower.startswith("watch:"):
            watch = line.split(":", 1)[1].strip()
    if not (what or meaning or watch):
        what = body
    return what, meaning, watch


# ── Public API ──────────────────────────────────────────────────────────────


def get_insight(code: str, force_refresh: bool = False) -> SentimentInsight | None:
    """Return the three-line sentiment insight for `code`.

    Returns None when there's nothing to interpret (zero mentions in the
    7-day window). Raises `reddit_sentiment.RedditNotConfigured` when
    creds + cache are both missing — the route translates that to 503.
    """
    if not force_refresh:
        cached = _load_cached(code)
        if cached is not None:
            return cached

    ticker = code.split(".", 1)[-1]
    name = _resolve_name(code)

    mentions = reddit_sentiment.fetch_mentions(code, ticker, days=7)
    if not mentions:
        return None
    summary = reddit_sentiment.aggregate(code, mentions, days=7)

    what, meaning, watch = _call_claude(_build_user_message(code, summary, name))
    insight = SentimentInsight(
        code=code,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=datetime.now(),
    )
    _save_cache(insight)
    return insight

"""Per-stock sentiment advisor — three short lines (What / Meaning / Watch).

Lazy-fetched behind the [learn more] toggle inside the SentimentBlock
drill-in panel. Reads `reddit_sentiment.aggregate()` for structured
context, asks Claude for three plain-English sentences, caches in
DuckDB on `(code, _PROMPT_VERSION)` with a 6h TTL — same cadence as
the other insights.

Direct, actionable framing (2026-06-06): the dashboard dropped its
educational-only guardrail. The Meaning line may read the community
tone directionally (what the mood suggests for someone holding the
stock) and the Watch line may carry a concrete, actionable takeaway.
The only surviving post-check ban is a slim anti-hype guard
(`FORBIDDEN_HYPE`) — the reader makes the final decision.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import reddit_sentiment
from api._advisor_guard import (
    FORBIDDEN_HYPE,
    RETRY_SUFFIX_HYPE_EN,
    RETRY_SUFFIX_HYPE_ZH,
    has_forbidden,
)
from api.data import prices
from api.data.moomoo_client import get_summary
from api.i18n import DEFAULT_LOCALE, Locale, prompt_version_with_locale

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
# v1 → v2 (2026-05-10): locale-aware prompts (en + zh).
# v2 → v3-recommend (2026-06-06): dashboard dropped its educational-only
# guardrail. Meaning may read tone directionally; Watch may carry an
# actionable takeaway; only an anti-hype post-check survives. Bumping the
# version invalidates stale cache rows.
_PROMPT_VERSION = "v3-recommend"

# The only post-check ban now: pump/hype. Directional / actionable
# language is allowed — that is the whole point of the rework.
_BANS = FORBIDDEN_HYPE

# Quiet fallback when both Claude attempts hit a hype word. Trio-shaped
# so the frontend renders uniformly.
_QUIET: dict[Locale, tuple[str, str, str]] = {
    "en": (
        "Reddit discussion on this stock is quiet, with no strong lean in the recent posts.",
        "There is no clear crowd mood here for someone holding the stock right now.",
        "Keep an eye on whether post volume or tone shifts before the next earnings update.",
    ),
    "zh": (
        "Reddit 对该股的讨论较为平淡，近期帖子没有明显倾向。",
        "对持有该股的人而言，目前缺乏明确的群体情绪。",
        "留意下次财报前帖子数量或语气是否出现变化。",
    ),
}

_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文回答。所有结构化标签（'What:' / 'Meaning:' / 'Watch:'）保持英文以便解析。"
        "采用零售投资者的朴素中文，避免术语。\n"
    ),
}

_PROMPT = """\
You are summarising Reddit discussion volume and tone for ONE stock,
over the past 7 days, for a long-horizon student investor. The reader
already sees the post counts and a small bar chart; this is the deeper
plain-English context.

You may give a direct, actionable view. Keep it calm and grounded: no
hype, no guarantees, no certainty claims. The reader makes the final
decision.

Output format, exact and machine-parsed, three lines:

What: <one sentence on volume + tone in plain words.>
Meaning: <one sentence on what the community mood suggests for someone
          who already owns this stock; reading the tone directionally is
          fine.>
Watch: <one sentence: what this suggests you might do or keep an eye on as
        you decide; a concrete, actionable takeaway is welcome.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- NEVER use em dashes (—). Use colons, commas, or periods instead.

Use plain words. Prefer "more posts read favourably than not" over
"sentiment is positive", and "discussion leans cautious" over "negative
tone", but you may also say plainly what the mood suggests.

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


def _load_cached(code: str, locale: Locale = DEFAULT_LOCALE) -> SentimentInsight | None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM sentiment_insight_cache "
            "WHERE code = ? AND prompt_version = ?",
            [code, pv],
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


def _save_cache(insight: SentimentInsight, locale: Locale = DEFAULT_LOCALE) -> None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO sentiment_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [
                insight.code,
                pv,
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


def _parse_body(body: str) -> tuple[str, str, str]:
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
    return what, meaning, watch


def _call_claude(
    user_message: str, locale: Locale = DEFAULT_LOCALE
) -> tuple[str, str, str]:
    """Returns (what, meaning, watch).

    Runs the anti-hype post-check + one retry. If both attempts hit a hype
    word, falls back to the locale-specific quiet trio.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/sentiment-insight."
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")
    bans = _BANS[locale]
    system_prompt = _PROMPT + _LANG_INSTRUCTION[locale]

    def _shot(system: str) -> str:
        response = client.messages.create(
            model=model,
            max_tokens=400,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        return "\n".join(b.text for b in response.content if b.type == "text").strip()

    body = _shot(system_prompt)
    bad = has_forbidden(body, bans, locale)
    if bad is not None:
        log.info("sentiment-insight: hype %r in first draft, retrying (locale=%s)", bad, locale)
        retry_suffix = (
            RETRY_SUFFIX_HYPE_ZH if locale == "zh" else RETRY_SUFFIX_HYPE_EN
        ).format(bad=bad)
        body = _shot(system_prompt + retry_suffix)
        bad2 = has_forbidden(body, bans, locale)
        if bad2 is not None:
            log.warning(
                "sentiment-insight: hype %r persisted after retry, quieting (locale=%s)",
                bad2, locale,
            )
            return _QUIET[locale]

    what, meaning, watch = _parse_body(body)
    if not (what or meaning or watch):
        what = body
    return what, meaning, watch


# ── Public API ──────────────────────────────────────────────────────────────


def get_insight(
    code: str, force_refresh: bool = False, locale: Locale = DEFAULT_LOCALE
) -> SentimentInsight | None:
    """Return the three-line sentiment insight for `code`.

    Returns None when there's nothing to interpret (zero mentions in the
    7-day window). Raises `RuntimeError` when `ANTHROPIC_API_KEY` is
    missing — the route translates that to 503.
    """
    if not force_refresh:
        cached = _load_cached(code, locale)
        if cached is not None:
            return cached

    ticker = code.split(".", 1)[-1]
    name = _resolve_name(code)

    mentions = reddit_sentiment.fetch_mentions(code, ticker, days=7)
    if not mentions:
        return None
    summary = reddit_sentiment.aggregate(code, mentions, days=7)

    what, meaning, watch = _call_claude(_build_user_message(code, summary, name), locale)
    insight = SentimentInsight(
        code=code,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=datetime.now(),
    )
    _save_cache(insight, locale)
    return insight

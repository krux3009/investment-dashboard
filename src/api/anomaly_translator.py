"""Translate moomoo's technical anomaly prose into plain English.

The reader is a beginner. moomoo returns content like:
    "May 1 KDJ has moved from neutral to overbought levels, with the
     three-day moving average crossing above the upper Bollinger Band."

We rewrite that into:
    "Around May 1 the price climbed quickly enough that several
     measures suggest it may pause."

Cache is keyed by sha256(content + kind) and lives in the same
prices.duckdb file (single-writer rule from CLAUDE.md). 7-day TTL —
moomoo's content tends to be stable for a day or two; if the source
text changes, the hash changes and a fresh translation runs.

If the Anthropic call fails for any reason (no API key, network,
malformed response) we return the original content. Stale jargon is
strictly better than a broken drill-in.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timedelta
from typing import Literal

from api.data import prices
from api.i18n import DEFAULT_LOCALE, Locale

log = logging.getLogger(__name__)

AnomalyKind = Literal["technical", "capital"]

_TTL = timedelta(days=7)

# Bumped whenever _TRANSLATOR_PROMPT is rewritten so the cache key
# changes and old translations aren't served. The actual cached row
# stays in DuckDB until the 7d TTL expires; we just stop reading it.
_PROMPT_VERSION = "v3-no-em-dash"

# The translator's system prompt. Mirrors the digest prompt's banned
# words so the LEAD / ticker rows and the drill-in speak the same voice.
_TRANSLATOR_PROMPT = """\
You rewrite one short piece of stock-market commentary into ONE short
sentence a complete beginner can understand. The reader has never
invested. They do not know what indicators, trends, or signals are.

Hard rules:
- Output ONE sentence, 25 words or fewer. No preamble, no labels.
- Lead with the concrete fact ("price climbed", "money flowed in"),
  not the indicator name ("RSI", "MA", "death cross", "Bollinger").
- Keep dates ("May 1") and specific numbers from the input verbatim.
  Drop dates only if removing them does not lose the timing.
- State observations only. No buy / sell / hold / target / forecast /
  predict / recommend. No hype words (surge, plunge, soar, crash,
  breakout, rally, tank).
- NEVER use em dashes (—) in the output. Use colons, commas, or
  periods instead.

Translate these CONCEPTS, not just the words. The output must read
like everyday English a parent could understand:

  Indicator says X is overbought
    → "the price has been climbing fast and could slow down soon"
  Indicator says X is oversold
    → "the price has been falling fast and could steady soon"
  MA5 / MA10 / MA20 / moving average
    → "the recent price trend"
  Closing price crossed above MA / Bollinger Band
    → "the price has been climbing steadily"
  Closing price crossed below MA
    → "the price has been slipping"
  Death cross
    → "the recent trend has shifted slightly downward"
  Golden cross
    → "the recent trend has shifted slightly upward"
  Bullish / bearish alignment
    → "the price trend has been pointing up / down"
  Block-trade net inflows
    → "big institutions have been buying"
  Block-trade net outflows
    → "big institutions have been selling"
  Decelerated by N%
    → "but slower than before (N% slower)"
  Short interest / short ratio
    → "bets that the price will fall"
  Perpetual securities / perpetual bonds
    → "raised long-term funding"

If the input cites several indicators all saying the same thing, write
ONE plain statement. Do not list indicator names.

If the input is purely a technical pattern with no concrete consequence
a beginner would care about (e.g. "MA5 crosses MA10 with no other
context"), output exactly: "Nothing notable today."

Tone: matter-of-fact, calm, like writing one line in a personal ledger.
"""


# ── Cache ────────────────────────────────────────────────────────────────────


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS anomaly_translation_cache (
                content_hash VARCHAR PRIMARY KEY,
                plain_content VARCHAR,
                translated_at TIMESTAMP
            )
            """
        )


def _hash_key(content: str, kind: AnomalyKind) -> str:
    h = hashlib.sha256()
    h.update(_PROMPT_VERSION.encode("utf-8"))
    h.update(b"\x00")
    h.update(kind.encode("utf-8"))
    h.update(b"\x00")
    h.update(content.encode("utf-8"))
    return h.hexdigest()


def _load_cached(key: str) -> str | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT plain_content, translated_at FROM anomaly_translation_cache "
            "WHERE content_hash = ?",
            [key],
        ).fetchone()
    if not row:
        return None
    plain, translated_at = row
    if datetime.now() - translated_at > _TTL:
        return None
    return plain


def _save_cache(key: str, plain: str) -> None:
    _ensure_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO anomaly_translation_cache VALUES (?, ?, ?)",
            [key, plain, datetime.now()],
        )


# ── Claude call ─────────────────────────────────────────────────────────────


def _call_claude(content: str, kind: AnomalyKind) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")

    user_message = f"Category: {kind}\n\nText to rewrite:\n{content.strip()}"

    response = client.messages.create(
        model=model,
        max_tokens=180,
        system=_TRANSLATOR_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    parts = [block.text for block in response.content if block.type == "text"]
    return "\n".join(parts).strip()


# ── Public API ──────────────────────────────────────────────────────────────


def translate(
    content: str, kind: AnomalyKind, locale: Locale = DEFAULT_LOCALE
) -> str:
    """Return a plain-language rewrite of moomoo anomaly content.

    For `locale="zh"` this short-circuits: moomoo returns Simplified
    Chinese already, so passthrough avoids an unnecessary Claude call.
    For `locale="en"` the legacy path runs (Claude rewrites the
    technical Chinese-source prose into plain English) — cached by
    content hash so the cost is paid at most once per unique moomoo
    prose.

    Empty / whitespace input passes through unchanged in both locales.
    """
    if not content or not content.strip():
        return content

    if locale == "zh":
        return content

    key = _hash_key(content, kind)
    cached = _load_cached(key)
    if cached is not None:
        return cached

    try:
        plain = _call_claude(content, kind)
    except Exception as exc:
        log.warning("anomaly translation failed (%s): %s", kind, exc)
        return content

    if not plain:
        return content

    _save_cache(key, plain)
    return plain

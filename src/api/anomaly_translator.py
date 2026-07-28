"""Translate moomoo's technical anomaly prose into plain English.

The reader is a beginner. moomoo returns content like:
    "May 1 KDJ has moved from neutral to overbought levels, with the
     three-day moving average crossing above the upper Bollinger Band."

We rewrite that into:
    "Around May 1 the price climbed quickly enough that several
     measures suggest it may pause."

Cache is keyed by sha256(prompt_version + kind + content) in the shared
DuckDB KV cache. 7-day TTL — moomoo's content tends to be stable for a
day or two; if the source text changes, the hash changes and a fresh
translation runs.

If the Anthropic call fails for any reason (no API key, network,
malformed response) we return the original content. Stale jargon is
strictly better than a broken drill-in. No anti-hype post-check on this
surface (single short sentence) — the spec passes empty ban tuples.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import timedelta
from typing import Literal

from api import advisor
from api.data import cache
from api.i18n import DEFAULT_LOCALE, Locale

log = logging.getLogger(__name__)

AnomalyKind = Literal["technical", "capital"]

_TTL = timedelta(days=7)
_CACHE_TABLE = "kv_anomaly_translation"

# Bumped whenever _TRANSLATOR_PROMPT is rewritten so the cache key
# changes and old translations aren't served.
# v3-no-em-dash → v4-recommend (2026-06-06): dropped the observation-only
# guardrail. The translation may now add a short plain "so what" (what
# this could mean / what to watch). Still anti-hype in tone.
_PROMPT_VERSION = "v4-recommend"

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
- You may add a short, plain "so what": what this could mean or what to
  keep an eye on. Keep it calm and grounded: no hype, no guarantees.
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

_SPEC = advisor.AdvisorSpec(
    surface="anomaly-translator",
    prompt=_TRANSLATOR_PROMPT,
    prompt_version=_PROMPT_VERSION,
    ttl=_TTL,
    max_tokens=180,
    # No language instruction appended (the bare prompt already reads as
    # English; zh never reaches Claude — see translate()); empty ban
    # tuples skip the hype guard by design.
    lang_instruction={"en": "", "zh": ""},
    bans={"en": (), "zh": ()},
)


def _hash_key(content: str, kind: AnomalyKind) -> str:
    h = hashlib.sha256()
    h.update(_PROMPT_VERSION.encode("utf-8"))
    h.update(b"\x00")
    h.update(kind.encode("utf-8"))
    h.update(b"\x00")
    h.update(content.encode("utf-8"))
    return h.hexdigest()


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

    # No key → raw moomoo prose, silently. Not an error worth logging
    # on every drill-in.
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return content

    key = _hash_key(content, kind)
    cached = cache.get(_CACHE_TABLE, key, _TTL)
    if cached is not None:
        return cached[0]

    user_message = f"Category: {kind}\n\nText to rewrite:\n{content.strip()}"
    try:
        plain = advisor.complete(_SPEC, user_message, "en")
    except Exception as exc:
        log.warning("anomaly translation failed (%s): %s", kind, exc)
        return content

    if not plain:
        return content

    cache.put(_CACHE_TABLE, key, plain)
    return plain

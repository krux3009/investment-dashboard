"""Plain-English commentary on the book's concentration shape.

Advisor pattern: the static endpoint already renders the ratios + the
stacked-bar SVG; this lazy block adds one What / Meaning / Watch trio
when the user expands. Cache key is the rounded shape so identical
books hit cache.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import concentration
from api.data import prices

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
_PROMPT_VERSION = "v1"

_PROMPT = """\
You are writing three short educational lines about the SHAPE of a
personal investment portfolio for a beginner investor's dashboard. The
reader is a first-year student. They already see the numeric ratios
(top-1, top-3, top-5 share, currency exposure, largest position);
this is the deeper plain-English context.

Output format — exact, machine-parsed, three lines:

What: <one sentence — describe the shape of the book in plain words.
       Name the most concentrated position and the dominant currency
       if relevant.>
Meaning: <one sentence — what the shape means in plain terms. Pattern
          or context. Avoid jargon.>
Watch: <one sentence — what to monitor as the shape changes over time
        (observation target, never an action).>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- Percentages quoted verbatim if used.

NEVER use these action words:
  buy / sell / hold / trim / add / target / forecast / predict / expect /
  recommend / "you should" / "you ought" / "consider [verb]" / "tomorrow".

NEVER use these hype words:
  surge / plunge / soar / crash / breakout / rally / tank.

NEVER use these portfolio-action words or framings:
  rebalance / diversify / "concentrated risk" / "too concentrated" /
  "spread out" / "reduce exposure" / "increase exposure" / over-weight /
  under-weight / over-allocated / under-allocated.

Describe shape and direction, not finance theory. Use plain everyday
words like "the book leans heavily on …", "USD makes up …",
"most of the value sits in …".

Tone: matter-of-fact, calm, considered. Like a patient teacher writing
one note in a personal ledger.

Output the three lines only. No preamble, no markdown, no bullets.
"""


@dataclass(frozen=True)
class ConcentrationInsight:
    cache_key: str
    what: str
    meaning: str
    watch: str
    generated_at: datetime
    cached: bool = False


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS concentration_insight_cache (
                cache_key VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                what VARCHAR,
                meaning VARCHAR,
                watch VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (cache_key, prompt_version)
            )
            """
        )


def _make_key(c: concentration.Concentration) -> str:
    biggest = c.single_name_max.code if c.single_name_max else "-"
    ccys = "|".join(f"{k}:{round(v, 2)}" for k, v in sorted(c.currency_exposure.items()))
    return f"{round(c.top1_pct, 2)}|{round(c.top3_pct, 2)}|{round(c.top5_pct, 2)}|{biggest}|{ccys}|n={c.count}"


def _load_cached(cache_key: str) -> tuple[str, str, str, datetime] | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM concentration_insight_cache "
            "WHERE cache_key = ? AND prompt_version = ?",
            [cache_key, _PROMPT_VERSION],
        ).fetchone()
    if not row:
        return None
    what, meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return what, meaning, watch, generated_at


def _save_cache(cache_key: str, what: str, meaning: str, watch: str, generated_at: datetime) -> None:
    _ensure_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO concentration_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [cache_key, _PROMPT_VERSION, what, meaning, watch, generated_at],
        )


def _build_user_message(c: concentration.Concentration) -> str:
    parts = [f"Holdings count: {c.count}"]
    if c.single_name_max:
        parts.append(
            f"Largest position: {c.single_name_max.ticker} "
            f"({c.single_name_max.code}) at {c.single_name_max.pct * 100:.1f}%"
        )
    parts.append(
        f"Top-N share: top-1 {c.top1_pct * 100:.1f}%, "
        f"top-3 {c.top3_pct * 100:.1f}%, top-5 {c.top5_pct * 100:.1f}%"
    )
    if c.currency_exposure:
        ccy_str = ", ".join(
            f"{k} {v * 100:.1f}%" for k, v in sorted(c.currency_exposure.items(), key=lambda kv: -kv[1])
        )
        parts.append(f"Currency exposure (USD-equivalent): {ccy_str}")
    return "\n".join(parts)


def _call_claude(user_message: str) -> tuple[str, str, str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/concentration-insight."
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


def get_insight(force_refresh: bool = False) -> ConcentrationInsight | None:
    c = concentration.get_concentration()
    if c.count == 0:
        return None
    cache_key = _make_key(c)
    if not force_refresh:
        cached = _load_cached(cache_key)
        if cached is not None:
            what, meaning, watch, gen_at = cached
            return ConcentrationInsight(
                cache_key=cache_key,
                what=what,
                meaning=meaning,
                watch=watch,
                generated_at=gen_at,
                cached=True,
            )
    user_message = _build_user_message(c)
    what, meaning, watch = _call_claude(user_message)
    now = datetime.now()
    _save_cache(cache_key, what, meaning, watch, now)
    return ConcentrationInsight(
        cache_key=cache_key,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=now,
    )

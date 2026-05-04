"""Per-event educational block for the foresight surface.

Three lines — What / Meaning / Watch — describing the event, how it
connects to the held book, and what an attentive investor would
observe as the date approaches. Cached on event_id, 6h TTL.

Forbidden-words guard mirrors digest.py: no buy/sell/hold/forecast/
predict/recommend/target/should/rally/surge/etc.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import foresight
from api.data import prices
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
_PROMPT_VERSION = "v1"

_PROMPT = """\
You are writing three short educational lines about an UPCOMING event
for a beginner investor's dashboard. The reader holds the listed
stocks; the event is on their forward calendar. They already see the
event date and short description; this is the deeper plain-English
context.

Output format — exact, machine-parsed, three lines:

What: <one sentence — describe the event itself in plain words.>
Meaning: <one sentence — how it connects to the listed holdings,
          observationally.>
Watch: <one sentence — what an attentive investor would observe as
        the date approaches. Observation target, never an action.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.

NEVER use these action words:
  buy / sell / hold / trim / add / target / forecast / predict / expect /
  recommend / "you should" / "you ought" / "consider [verb]" / "tomorrow".

NEVER use these hype words:
  surge / plunge / soar / crash / breakout / rally / tank.

Translate concepts: never use alpha / beta / outperform / underperform /
benchmark-beating / catalyst / "could move" / "expected to". Use plain
everyday words like "the print could shift the rate path", "the talk
will share product details", "the meeting will set the rate decision".

Do NOT predict the outcome of the event. Do not give advice.

Tone: matter-of-fact, calm, considered. Like a patient teacher writing
one note in a personal ledger.

Output the three lines only. No preamble, no markdown, no bullets.
"""


@dataclass(frozen=True)
class ForesightInsight:
    event_id: str
    what: str
    meaning: str
    watch: str
    generated_at: datetime
    cached: bool = False


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS foresight_insight_cache (
                event_id VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                what VARCHAR,
                meaning VARCHAR,
                watch VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (event_id, prompt_version)
            )
            """
        )


def _load_cached(event_id: str) -> tuple[str, str, str, datetime] | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM foresight_insight_cache "
            "WHERE event_id = ? AND prompt_version = ?",
            [event_id, _PROMPT_VERSION],
        ).fetchone()
    if not row:
        return None
    what, meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return what, meaning, watch, generated_at


def _save_cache(event_id: str, what: str, meaning: str, watch: str, generated_at: datetime) -> None:
    _ensure_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO foresight_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [event_id, _PROMPT_VERSION, what, meaning, watch, generated_at],
        )


def _build_user_message(ev: foresight.ForesightEvent, holdings: list[str]) -> str:
    lines = [
        f"Event: {ev.label}",
        f"Date: {ev.date} (in {ev.days_until} days)",
        f"Kind: {ev.kind}",
        f"Description: {ev.description}",
    ]
    if ev.ticker:
        lines.append(f"Tied to holding: {ev.ticker} ({ev.code})")
    lines.append(f"Reader holds: {', '.join(holdings) if holdings else '(no positions)'}")
    return "\n".join(lines)


def _call_claude(user_message: str) -> tuple[str, str, str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/foresight-insight."
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


def get_insight(event_id: str, days: int = 30, force_refresh: bool = False) -> ForesightInsight | None:
    if not force_refresh:
        cached = _load_cached(event_id)
        if cached is not None:
            what, meaning, watch, gen_at = cached
            return ForesightInsight(
                event_id=event_id, what=what, meaning=meaning, watch=watch,
                generated_at=gen_at, cached=True,
            )

    ev = foresight.find_event(event_id, days=max(days, 30))
    if ev is None:
        return None

    summary = get_summary()
    holdings = [p.ticker for p in summary.positions]

    what, meaning, watch = _call_claude(_build_user_message(ev, holdings))
    now = datetime.now()
    _save_cache(event_id, what, meaning, watch, now)
    return ForesightInsight(
        event_id=event_id, what=what, meaning=meaning, watch=watch, generated_at=now,
    )

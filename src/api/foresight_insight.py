"""Per-event block for the foresight surface.

Three lines — What / Meaning / Watch — describing the event, how it
connects to the held book, and a concrete, actionable takeaway for the
holder as the date approaches. Cached on event_id, 6h TTL.

The educational-only guardrail was dropped (2026-06-06): the prose may
now give a direct, actionable view on what the event could mean. The
only surviving post-check ban is a slim anti-hype list (FORBIDDEN_HYPE)
so the model can recommend but never pump.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import foresight
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
# v2-no-em-dash → v3-no-em-dash (2026-05-10): locale-aware prompts.
# v3-no-em-dash → v4-source-edit (2026-05-13): ported the digest v6
# source-edit pairs into _PROMPT (en) + _LANG_INSTRUCTION["zh"].
# v4-source-edit → v5-recommend (2026-06-06): dropped the educational-only
# guardrail. The prompt no longer forbids prediction, action words, or
# finance-theory terms; "Watch" now invites a concrete, actionable
# takeaway. The only surviving post-check ban is FORBIDDEN_HYPE. Cache
# keys "v5-recommend-en" / "v5-recommend-zh"; old v4 rows orphan and
# rebuild on next request.
_PROMPT_VERSION = "v5-recommend"

# The only post-check ban now: pump/hype. Prediction, action, and
# positioning language are all allowed — that is the point of the rework.
_BANS = FORBIDDEN_HYPE

# Quiet fallback when both Claude attempts hit a hype word.
_QUIET: dict[Locale, tuple[str, str, str]] = {
    "en": (
        "An upcoming dated event tied to one or more of the listed holdings or the broader macro calendar.",
        "Its details connect to the listed book through the named ticker or rate channel.",
        "Keep an eye on the reported figures versus prior prints on the day of release.",
    ),
    "zh": (
        "持仓列表或宏观日历上的一个即将到来的事件。",
        "其细节通过具名持仓或利率渠道与账本相连。",
        "发布当日留意公布数据与此前读数的对比。",
    ),
}


_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文回答。所有结构化标签（'What:' / 'Meaning:' / 'Watch:'）保持英文以便解析。"
        "采用零售投资者的朴素中文。"
        "可以直接说明该事件对持仓可能意味着什么，以及临近时持有者可考虑做什么或留意什么。"
        "保持冷静、有据的口吻：不要夸大，不做保证，不下必然性结论。最终决定由读者做出。"
        "\n\nWatch 一行的时间词优先使用 \"下次/下个/未来\"，避免 \"后续\"。\n"
    ),
}

_PROMPT = """\
You are writing three short lines about an UPCOMING event for a retail
investor's dashboard. The reader holds the listed stocks; the event is
on their forward calendar. They already see the event date and short
description; this is the deeper plain-English context.

You may give a direct, actionable view on what the event could mean for
the listed holdings. Keep it calm and grounded: no hype, no guarantees,
no certainty claims. The reader makes the final decision.

Output format, exact and machine-parsed, three lines:

What: <one sentence: describe the event itself in plain words.>
Meaning: <one sentence: what the event could mean for the listed
          holdings.>
Watch: <one sentence: what an attentive holder might do or keep an eye
        on as the date approaches; a concrete, actionable takeaway is
        welcome.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- Use plain everyday words a beginner could follow. Where a concept has
  a jargon name, prefer the plain phrasing ("the print could shift the
  rate path", "the talk will share product details", "the meeting will
  set the rate decision").
- NEVER use em dashes (—) in any output line. Use colons, commas, or
  periods instead.

Tone: matter-of-fact, calm, considered. Like a sharp analyst writing one
note in a personal ledger. Confident is fine; loud is not.

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


def _load_cached(
    event_id: str, locale: Locale = DEFAULT_LOCALE
) -> tuple[str, str, str, datetime] | None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM foresight_insight_cache "
            "WHERE event_id = ? AND prompt_version = ?",
            [event_id, pv],
        ).fetchone()
    if not row:
        return None
    what, meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return what, meaning, watch, generated_at


def _save_cache(
    event_id: str,
    what: str,
    meaning: str,
    watch: str,
    generated_at: datetime,
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO foresight_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [event_id, pv, what, meaning, watch, generated_at],
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
    if not (what or meaning or watch):
        what = body
    return what, meaning, watch


def _call_claude(
    user_message: str, locale: Locale = DEFAULT_LOCALE
) -> tuple[str, str, str]:
    """Returns (what, meaning, watch). Runs FORBIDDEN post-check +
    one retry; falls back to the locale-specific quiet template on
    repeated violation.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/foresight-insight."
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
        log.info(
            "foresight_insight: hype %r in first draft, retrying (locale=%s)",
            bad, locale,
        )
        retry_suffix = (
            RETRY_SUFFIX_HYPE_ZH if locale == "zh" else RETRY_SUFFIX_HYPE_EN
        ).format(bad=bad)
        body = _shot(system_prompt + retry_suffix)
        bad2 = has_forbidden(body, bans, locale)
        if bad2 is not None:
            log.warning(
                "foresight_insight: hype %r persisted after retry, quieting (locale=%s)",
                bad2, locale,
            )
            return _QUIET[locale]

    return _parse_body(body)


def get_insight(
    event_id: str,
    days: int = 30,
    force_refresh: bool = False,
    locale: Locale = DEFAULT_LOCALE,
) -> ForesightInsight | None:
    if not force_refresh:
        cached = _load_cached(event_id, locale)
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

    what, meaning, watch = _call_claude(_build_user_message(ev, holdings), locale)
    now = datetime.now()
    _save_cache(event_id, what, meaning, watch, now, locale)
    return ForesightInsight(
        event_id=event_id, what=what, meaning=meaning, watch=watch, generated_at=now,
    )

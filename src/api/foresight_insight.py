"""Per-event block for the foresight surface.

Three lines — What / Meaning / Watch — describing the event, how it
connects to the held book, and a concrete, actionable takeaway for the
holder as the date approaches. Cached on event_id, 6h TTL. Engine
(client, guard, cache) lives in `api.advisor`.

The educational-only guardrail was dropped (2026-06-06): the prose may
now give a direct, actionable view on what the event could mean. The
only surviving post-check ban is a slim anti-hype list (FORBIDDEN_HYPE)
so the model can recommend but never pump.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from api import advisor, foresight
from api.data.moomoo_client import get_summary
from api.i18n import DEFAULT_LOCALE, Locale

# v2-no-em-dash → v3-no-em-dash (2026-05-10): locale-aware prompts.
# v3-no-em-dash → v4-source-edit (2026-05-13): ported the digest v6
# source-edit pairs into _PROMPT (en) + _LANG_INSTRUCTION["zh"].
# v4-source-edit → v5-recommend (2026-06-06): dropped the educational-only
# guardrail; only the slim anti-hype post-check survives.
_PROMPT_VERSION = "v5-recommend"

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

_SPEC = advisor.AdvisorSpec(
    surface="foresight-insight",
    prompt=_PROMPT,
    prompt_version=_PROMPT_VERSION,
    ttl=timedelta(hours=6),
    lang_instruction=_LANG_INSTRUCTION,
)


@dataclass(frozen=True)
class ForesightInsight:
    event_id: str
    what: str
    meaning: str
    watch: str
    generated_at: datetime
    cached: bool = False


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


def get_insight(
    event_id: str,
    days: int = 30,
    force_refresh: bool = False,
    locale: Locale = DEFAULT_LOCALE,
) -> ForesightInsight | None:
    if not force_refresh:
        cached = advisor.load(_SPEC, event_id, locale)
        if cached is not None:
            payload, gen_at = cached
            return ForesightInsight(
                event_id=event_id,
                what=payload["what"],
                meaning=payload["meaning"],
                watch=payload["watch"],
                generated_at=gen_at,
                cached=True,
            )

    ev = foresight.find_event(event_id, days=max(days, 30))
    if ev is None:
        return None

    summary = get_summary()
    holdings = [p.ticker for p in summary.positions]

    body = advisor.complete(_SPEC, _build_user_message(ev, holdings), locale)
    if body is None:
        what, meaning, watch = _QUIET[locale]
    else:
        what, meaning, watch = advisor.parse_wmw(body)
    now = advisor.save(
        _SPEC, event_id, {"what": what, "meaning": meaning, "watch": watch}, locale
    )
    return ForesightInsight(
        event_id=event_id, what=what, meaning=meaning, watch=watch, generated_at=now,
    )

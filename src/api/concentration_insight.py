"""Plain-English commentary on the book's concentration shape.

Advisor pattern: the static endpoint already renders the ratios + the
stacked-bar SVG; this lazy block adds one What / Meaning / Watch trio
when the user expands. Cache key is the rounded shape so identical
books hit cache. Engine (client, guard, cache) lives in `api.advisor`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from api import advisor, concentration
from api.i18n import DEFAULT_LOCALE, Locale

# v2-no-em-dash → v3-no-em-dash (2026-05-10): locale-aware prompts.
# v3-no-em-dash → v4-source-edit (2026-05-13): ported the digest v6
# source-edit pairs (pace / forward-look / magnitude bans).
# v4-source-edit → v5-recommend (2026-06-06): dropped the educational-only
# guardrail; only the slim anti-hype post-check survives.
_PROMPT_VERSION = "v5-recommend"

# Quiet fallback when both Claude attempts produce a forbidden hit.
_QUIET: dict[Locale, tuple[str, str, str]] = {
    "en": (
        "The book holds a measurable number of positions with one of them carrying the largest single-name share.",
        "The ratios already shown above describe the current shape.",
        "How the top-N share and currency exposure change over the next window.",
    ),
    "zh": (
        "账本持有若干仓位，其中一只为最大单一持仓。",
        "上方比率已展示当前形态。",
        "未来数月头号持仓占比与货币敞口的变化方向。",
    ),
}

_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文回答。所有结构化标签（'What:' / 'Meaning:' / 'Watch:'）保持英文以便解析。"
        "采用零售投资者的朴素中文。可以给出明确、可执行的方向性看法"
        "（例如加仓、减仓、持有、再平衡或分散持仓），但须保持冷静、有据的口吻：不得夸大、保证或断言必然。"
        "\n\nWatch 一行的时间词优先使用 \"下次/下个/未来\"，避免 \"后续\"。\n"
    ),
}

_PROMPT = """\
You are writing three short lines about the SHAPE of a personal
investment portfolio for a long-horizon investor's dashboard. They
already see the numeric ratios (top-1, top-3, top-5 share, currency
exposure, largest position); this is the deeper plain-English context.

You may give a direct, actionable view (e.g. whether to add to, trim,
hold, rebalance, or diversify the book). Keep it calm and grounded: no
hype, no guarantees, no certainty claims. The reader makes the final
decision.

Output format, exact and machine-parsed, three lines:

What: <one sentence: describe the shape of the book in plain words.
       Name the most concentrated position and the dominant currency
       if relevant.>
Meaning: <one sentence: what the shape means in plain terms. Pattern
          or context. Avoid jargon.>
Watch: <one sentence: what this suggests you might do or keep an eye on
        as you decide; a concrete, actionable takeaway is welcome.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- Percentages quoted verbatim if used.
- NEVER use em dashes (—) in any output line. Use colons, commas, or
  periods instead.

Use plain everyday words like "the book leans heavily on …", "USD
makes up …", "most of the value sits in …", then say what you'd do.

Tone: matter-of-fact, calm, considered. Like a steady hand writing one
note in a personal ledger.

Output the three lines only. No preamble, no markdown, no bullets.
"""

_SPEC = advisor.AdvisorSpec(
    surface="concentration-insight",
    prompt=_PROMPT,
    prompt_version=_PROMPT_VERSION,
    ttl=timedelta(hours=6),
    lang_instruction=_LANG_INSTRUCTION,
)


@dataclass(frozen=True)
class ConcentrationInsight:
    cache_key: str
    what: str
    meaning: str
    watch: str
    generated_at: datetime
    cached: bool = False


def _make_key(c: concentration.Concentration) -> str:
    biggest = c.single_name_max.code if c.single_name_max else "-"
    ccys = "|".join(f"{k}:{round(v, 2)}" for k, v in sorted(c.currency_exposure.items()))
    return f"{round(c.top1_pct, 2)}|{round(c.top3_pct, 2)}|{round(c.top5_pct, 2)}|{biggest}|{ccys}|n={c.count}"


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


def get_insight(
    force_refresh: bool = False, locale: Locale = DEFAULT_LOCALE
) -> ConcentrationInsight | None:
    c = concentration.get_concentration()
    if c.count == 0:
        return None
    cache_key = _make_key(c)
    if not force_refresh:
        cached = advisor.load(_SPEC, cache_key, locale)
        if cached is not None:
            payload, gen_at = cached
            return ConcentrationInsight(
                cache_key=cache_key,
                what=payload["what"],
                meaning=payload["meaning"],
                watch=payload["watch"],
                generated_at=gen_at,
                cached=True,
            )
    body = advisor.complete(_SPEC, _build_user_message(c), locale)
    if body is None:
        what, meaning, watch = _QUIET[locale]
    else:
        what, meaning, watch = advisor.parse_wmw(body)
    now = advisor.save(
        _SPEC, cache_key, {"what": what, "meaning": meaning, "watch": watch}, locale
    )
    return ConcentrationInsight(
        cache_key=cache_key,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=now,
    )

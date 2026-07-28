"""Shared FORBIDDEN post-check + retry helper for Claude advisor surfaces.

Mirrors the shape of `analysts/_base.call_analyst`'s in-line guard but
factored out so the four prose advisors (insight, benchmark_insight,
concentration_insight, foresight_insight) can share the same logic.

Each advisor passes:
  • the raw model body (potentially multi-line "What:/Meaning:/Watch:")
  • a per-locale ban tuple
  • the locale, so the retry suffix matches the reader's language

`has_forbidden` returns the first banned substring it finds (case-
insensitive for EN, exact for ZH since CJK has no whitespace word
boundary). Substring semantics match `analysts/_base._has_forbidden`
so a ban entry of "sharp" catches "sharply", "decelerat" catches
"deceleration", etc.

Ban tuples in the four advisors are intentionally a SUBSET of the
prose-only ban list in each prompt: ambiguous tokens with legitimate
descriptive uses (buy/sell/hold/add/trim/target in EN, 买入/卖出 in
ZH) live in the prompt prose only — the prompt frames them as
"never recommend buy/sell" while the model retains them for
descriptive narration ("big institutions sold"). The post-check
tuple stays narrow to avoid retry loops on legitimate descriptive
prose.

RETRY_SUFFIX_HYPE_EN / RETRY_SUFFIX_HYPE_ZH are appended to the original
system prompt on the second attempt. They name the violating word so the
model gets explicit feedback. On a second failure the caller falls
back to a quiet template (each advisor defines its own).
"""

from __future__ import annotations

from typing import Literal


Locale = Literal["en", "zh"]


def has_forbidden(text: str, bans: tuple[str, ...], locale: Locale = "en") -> str | None:
    """Return the first banned substring found in `text`, or None.

    EN: case-insensitive substring match (mirrors analysts/_base).
    ZH: case-insensitive substring match on the raw text — CJK has no
    whitespace word boundary so substring is appropriate here too.
    """
    if not text:
        return None
    haystack = text.lower() if locale == "en" else text
    for word in bans:
        needle = word.lower() if locale == "en" else word
        if needle in haystack:
            return word
    return None


# ── Recommendation-era guard (2026-06-06) ────────────────────────────────────
#
# The dashboard moved from "educational-only" to direct recommendations
# (Action / Why / Confidence / Risk). Action / forecast / target / sizing
# language is now ALLOWED. The only post-check ban that survives is a slim
# anti-hype list: the model may recommend, but never pump. This keeps the
# Quiet-Ledger tone (calm, grounded) and protects against a confidently-wrong
# model overselling a call. Pair with the mandatory Confidence + Risk fields.
#
# Modules migrate from their old observational `_BANS` to FORBIDDEN_HYPE +
# RETRY_SUFFIX_HYPE_* as they are reworked (insight first, then the rest).
FORBIDDEN_HYPE: dict[Locale, tuple[str, ...]] = {
    "en": (
        "guaranteed", "guarantee", "can't lose", "cant lose", "cannot lose",
        "risk-free", "riskless", "to the moon", "lambo", "get rich",
        "sure thing", "no-brainer", "no brainer", "must buy", "must-buy",
        "can't miss", "cant miss", "easy money", "free money", "yolo",
        "slam dunk", "100% certain", "printing money",
    ),
    "zh": (
        "稳赚", "包赚", "稳赚不赔", "必涨", "一定涨", "稳涨", "躺赚",
        "无风险", "零风险", "财富自由", "暴富", "一夜暴富", "稳赢",
    ),
}

RETRY_SUFFIX_HYPE_EN = (
    "\n\nIMPORTANT: your previous draft used the forbidden hype word "
    '"{bad}". Rewrite the whole output without it. A recommendation is fine, '
    "but keep a calm, grounded tone: no guarantees, no hype, no certainty "
    "claims. Keep the same labelled-line format."
)

RETRY_SUFFIX_HYPE_ZH = (
    "\n\n重要：先前的草稿包含禁用的夸大词 "
    '"{bad}"，请重写整个输出并完全避免它。可以给出建议，'
    "但须保持冷静、有据的口吻：不得做出保证、夸大或必然性表述。保持相同的标签格式。"
)

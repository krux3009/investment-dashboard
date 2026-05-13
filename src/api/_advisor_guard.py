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

RETRY_SUFFIX_EN / RETRY_SUFFIX_ZH are appended to the original system
prompt on the second attempt. They name the violating word so the
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


RETRY_SUFFIX_EN = (
    "\n\nIMPORTANT: your previous draft used the forbidden word "
    '"{bad}". Rewrite the whole output without it. Stay observational, '
    "no action language, no magnitude characterization, no pace or "
    "forward-look. Keep the same labelled-line format."
)

RETRY_SUFFIX_ZH = (
    "\n\n重要：先前的草稿包含禁用词 "
    '"{bad}"，请重写整个输出并完全避免它。仅使用观察口吻，'
    "不得出现行动建议、幅度修饰、节奏或前瞻性表达。保持相同的标签格式。"
)

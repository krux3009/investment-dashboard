"""Shared Claude-call shape + forbidden-words guard for analyst tiles.

Each analyst module imports `call_analyst` and provides:
  • role label ("Fundamentals" | "News" | "Sentiment" | "Technical")
  • role-specific bans extending FORBIDDEN_BASE — keyed per locale
  • a context dict of structured signals (no prose) for that dimension

The shared call enforces:
  • ≤22 word sentence (or ≤55 char Chinese), observation framing
  • Forbidden-words post-validation with one retry
  • Quiet fallback string when context is empty (locale-aware)

Client construction + guard + retry run through the shared engine in
`api.advisor` (whole prompt travels in the user message — no system
prompt, the historical tile shape).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import timedelta

from api import advisor
from api._advisor_guard import FORBIDDEN_HYPE
from api.i18n import Locale

log = logging.getLogger(__name__)


# v5 split: trading-action subset. Retained for reference / legacy callers,
# but as of the recommendation-era rework (2026-06-06) it is NO LONGER folded
# into the active post-check ban list — directional/actionable reads are now
# allowed in the tiles. The only active bans are the anti-hype list.
FORBIDDEN_TRADING_ACTIONS: tuple[str, ...] = (
    "buy", "sell", "hold", "trim", "add", "target", "forecast",
    "predict", "expect", "recommend", "surge", "plunge", "soar",
    "crash", "breakout", "rally", "tank", "should", "ought",
    "bullish", "bearish",
)


FORBIDDEN_TRADING_ACTIONS_ZH: tuple[str, ...] = (
    "买入", "买进", "卖出", "卖空", "持有", "加仓", "减仓", "建仓", "清仓",
    "目标价", "预测", "预计", "推荐", "建议",
    "应该", "理应",
    "看多", "看涨", "看空", "看跌",
    "大涨", "暴涨", "飙升", "大跌", "暴跌", "崩盘",
    "突破点", "反弹",
)


# Recommendation-era (2026-06-06): the only active post-check ban is the slim
# anti-hype list. The model may give a directional / actionable read; it just
# can't pump (no guarantees, no "to the moon", etc.). Shared with the prose
# advisors via `api._advisor_guard.FORBIDDEN_HYPE`.
FORBIDDEN_BASE: tuple[str, ...] = FORBIDDEN_HYPE["en"]


# Chinese mirror — same anti-hype-only list.
FORBIDDEN_BASE_ZH: tuple[str, ...] = FORBIDDEN_HYPE["zh"]


_ROLE_ZH: dict[str, str] = {
    "Fundamentals": "基本面",
    "News": "新闻",
    "Sentiment": "情绪",
    "Technical": "技术",
}


# Phrase a sentence must contain to be counted as a quiet placeholder
# when re-inflating from cache. Chosen so neither phrase shows up in
# normal observation prose.
_QUIET_MARKER_EN = "Quiet on "
_QUIET_MARKER_ZH = "无重要信号"


def is_quiet_sentence(sentence: str) -> bool:
    return _QUIET_MARKER_EN in sentence or _QUIET_MARKER_ZH in sentence


@dataclass(frozen=True)
class AnalystOutput:
    sentence: str          # ≤22 words EN / ≤55 chars CN, no forbidden words
    is_quiet: bool         # true when context empty → locale-aware quiet line


def _quiet(role: str, locale: Locale = "en") -> AnalystOutput:
    if locale == "zh":
        zh = _ROLE_ZH.get(role, role)
        sentence = f"本周{zh}方面无重要信号。"
    else:
        sentence = f"Quiet on {role.lower()} this week."
    return AnalystOutput(sentence=sentence, is_quiet=True)


def _word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


_PROMPT_TEMPLATE_EN = """\
You are the {role} analyst on a long-horizon investor's reading desk for
{ticker} ({name}). Write ONE sentence about today's {role_lower} signals
for this stock. Plain English, ≤22 words.

You may give a short directional or actionable read. Keep it calm and
grounded: no hype, no guarantees.

Forbidden words (anywhere in your output): {forbidden_csv}.

NEVER use em dashes (—). Use colons, commas, or periods.

If the context below is empty or all-null, output exactly:
"Quiet on {role_lower} this week."

Output: just the sentence. No preamble, no quotes, no markdown.

Respond in English.

Context:
{context_json}
"""


_PROMPT_TEMPLATE_ZH = """\
你是一位长线投资者阅读台上的{role_zh}分析师，标的为 {ticker}（{name}）。
请用一句简体中文记录今日该股票的{role_zh}方面信号。≤55 个汉字。

可以给出有方向性或可操作的简短判断。保持冷静、有据，不夸大、不做保证。

禁用词（输出中任意位置都不得出现）：{forbidden_csv}。

切勿使用破折号（—）。可使用冒号、逗号、句号或顿号。

若下方 context 为空或全部为 null，请原样输出：
"本周{role_zh}方面无重要信号。"

输出仅为一句话，无前导说明、无引号、无 markdown。

请使用简体中文回答。日期保留原英文（如 "May 8"）即可，无需翻译。

Context:
{context_json}
"""


def call_analyst(
    role: str,
    ticker: str,
    name: str,
    context: dict,
    role_specific_bans: dict[Locale, tuple[str, ...]] | tuple[str, ...],
    *,
    is_context_empty: bool,
    locale: Locale = "en",
) -> AnalystOutput:
    """Single Claude call. Returns AnalystOutput.

    On empty context: short-circuits with the locale-aware quiet
    fallback (no Claude call, no spend). On forbidden-word violation:
    one retry with a stricter system prompt; if still failing, falls
    back to quiet.

    `role_specific_bans` accepts either a `tuple[str, ...]` (legacy
    en-only) or a `dict[Locale, tuple[str, ...]]` (locale-aware).
    """
    if is_context_empty:
        return _quiet(role, locale)

    if isinstance(role_specific_bans, dict):
        role_bans = role_specific_bans.get(locale, ())
    else:
        role_bans = role_specific_bans  # legacy en-only path

    if locale == "zh":
        bans = FORBIDDEN_BASE_ZH + role_bans
        template = _PROMPT_TEMPLATE_ZH
        prompt_kwargs = {
            "role_zh": _ROLE_ZH.get(role, role),
            "ticker": ticker,
            "name": name,
            "forbidden_csv": "、".join(bans),
            "context_json": json.dumps(context, indent=2, default=str, ensure_ascii=False),
        }
    else:
        bans = FORBIDDEN_BASE + role_bans
        template = _PROMPT_TEMPLATE_EN
        prompt_kwargs = {
            "role": role,
            "role_lower": role.lower(),
            "ticker": ticker,
            "name": name,
            "forbidden_csv": ", ".join(bans),
            "context_json": json.dumps(context, indent=2, default=str),
        }

    prompt = template.format(**prompt_kwargs)
    # Per-call spec: the merged ban tuple varies by role + locale, and the
    # whole formatted prompt travels as the user message (empty
    # lang_instruction → engine sends no system prompt at all). This spec
    # is for complete() ONLY — digest.py owns the tile cache, so never
    # pass it to advisor.load/save (prompt_version is deliberately empty
    # and ttl zero, which would make every cache read a miss).
    spec = advisor.AdvisorSpec(
        surface="digest",
        prompt="",
        prompt_version="",
        ttl=timedelta(0),
        max_tokens=180,
        lang_instruction={"en": "", "zh": ""},
        bans={locale: bans, ("zh" if locale == "en" else "en"): ()},
    )
    body = advisor.complete(spec, prompt, locale, system="")
    if body is None:
        log.warning(
            "analyst %s/%s/%s: forbidden word persisted after retry; quieting",
            role, ticker, locale,
        )
        return _quiet(role, locale)
    sentence = body.strip().strip('"').strip("'")

    if locale == "en" and _word_count(sentence) > 28:
        log.info(
            "analyst %s/%s: sentence over budget (%d words), keeping",
            role, ticker, _word_count(sentence),
        )

    return AnalystOutput(sentence=sentence, is_quiet=False)

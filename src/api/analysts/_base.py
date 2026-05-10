"""Shared Claude-call shape + forbidden-words guard for analyst tiles.

Each analyst module imports `call_analyst` and provides:
  • role label ("Fundamentals" | "News" | "Sentiment" | "Technical")
  • role-specific bans extending FORBIDDEN_BASE — keyed per locale
  • a context dict of structured signals (no prose) for that dimension

The shared call enforces:
  • ≤22 word sentence (or ≤55 char Chinese), observation framing
  • Forbidden-words post-validation with one retry
  • Quiet fallback string when context is empty (locale-aware)

The same Claude SDK call shape as `api.insight._call_claude`. Reuses
`ANTHROPIC_DIGEST_MODEL` env var.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass

from api.i18n import Locale

log = logging.getLogger(__name__)


# Mirrors digest.py / insight.py. Action + hype words forbidden across
# every analyst tile.
FORBIDDEN_BASE: tuple[str, ...] = (
    "buy", "sell", "hold", "trim", "add", "target", "forecast",
    "predict", "expect", "recommend", "surge", "plunge", "soar",
    "crash", "breakout", "rally", "tank", "should", "ought",
    "bullish", "bearish",
    # Magnitude qualifiers (v3): describe ≠ characterize.
    "notable", "notably", "significant", "significantly",
    "remarkable", "remarkably", "impressive", "impressively",
    "strong", "weak", "robust", "solid", "sharp", "stark",
    "dramatic", "dramatically", "modest", "outsized", "massive",
    # Highlight verbs (v3).
    "registers", "boasts", "showcases", "demonstrates", "highlights",
    # Indicator-behavior + activity stems (v4): describe the data, don't
    # narrate the indicator. Substring match catches inflections — e.g.
    # "decelerat" covers deceleration / decelerate / decelerating /
    # decelerated; "mover" covers movers / mover.
    "momentum", "decelerat", "mover",
)


# Chinese mirror. Same observation-only register; substring match still
# applies (CJK substrings are stable). v1 — review pass intended.
FORBIDDEN_BASE_ZH: tuple[str, ...] = (
    # Action language
    "买入", "买进", "卖出", "卖空", "持有", "加仓", "减仓", "建仓", "清仓",
    "目标价", "预测", "预计", "推荐", "建议",
    "应该", "理应",
    "看多", "看涨", "看空", "看跌",
    # Hype
    "大涨", "暴涨", "飙升", "大跌", "暴跌", "崩盘",
    "突破点", "反弹",
    # Magnitude qualifiers
    "显著", "重大", "出色", "强劲", "疲软", "稳健", "急剧",
    "戏剧性",
    # Indicator-behavior (v4 mirror)
    "动能", "势头",
)


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


def _has_forbidden(text: str, bans: tuple[str, ...]) -> str | None:
    """Return the first banned word found (case-insensitive, substring-aware),
    or None if clean. Substring-aware so 'breakouts' trips on 'breakout'.
    """
    lower = text.lower()
    for word in bans:
        if word.lower() in lower:
            return word
    return None


_PROMPT_TEMPLATE_EN = """\
You are the {role} analyst on a long-horizon investor's reading desk for
{ticker} ({name}). Write ONE sentence about today's {role_lower} signals
for this stock. Plain English, ≤22 words. Frame as observation only.

Forbidden words (anywhere in your output): {forbidden_csv}.

Report numbers as numbers. Do not characterize their magnitude.
Bad: "registers a notable 45% gain"
Good: "30-day change is +45%"

Do not characterize the pace of a trend. Describe what the price did,
not whether the move is accelerating, decelerating, slowing, or easing.
Bad: "pace of decline slowing" / "rate-of-change easing"
Good: "30-day change is -3.79%, three of the last five sessions lower"

Do not state forward-looking expectations. Stick to what has happened.
Bad: "price rising at a pace that may face friction ahead"
Good: "30-day change is +100%, current price near 30-day high"

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
观察口吻，不带行动建议。

禁用词（输出中任意位置都不得出现）：{forbidden_csv}。

数字按原数字写出，不要修饰其幅度。
反例："登记了显著的 45% 涨幅"
正例："30 天涨幅为 +45%"

不要描述趋势的节奏。写价格做了什么，不要说走势在加速、减速、放缓或趋缓。
反例："下跌节奏放缓" / "上行速度趋缓"
正例："30 天变化为 -3.79%，近五个交易日中有三个收低"

不要表述前瞻性预期。仅写已发生的事实。
反例："价格上行，可能面临阻力"
正例："30 天涨幅为 +100%，当前价格接近 30 天高点"

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

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/digest."
        )

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
    sentence = _claude_one_shot(prompt, max_tokens=180)
    bad = _has_forbidden(sentence, bans)
    if bad is not None:
        log.info(
            "analyst %s/%s/%s: forbidden word %r in first draft, retrying",
            role, ticker, locale, bad,
        )
        retry_suffix_en = (
            "\n\nIMPORTANT: your previous draft used the forbidden word "
            f'"{bad}". Rewrite without it. Plain observational language only.'
        )
        retry_suffix_zh = (
            "\n\n重要：先前的草稿包含禁用词 "
            f'"{bad}"，请重写并完全避免它。仅使用观察口吻。'
        )
        retry_prompt = prompt + (retry_suffix_zh if locale == "zh" else retry_suffix_en)
        sentence = _claude_one_shot(retry_prompt, max_tokens=180)
        bad = _has_forbidden(sentence, bans)
        if bad is not None:
            log.warning(
                "analyst %s/%s/%s: forbidden word %r persisted after retry; quieting",
                role, ticker, locale, bad,
            )
            return _quiet(role, locale)

    if locale == "en" and _word_count(sentence) > 28:
        log.info(
            "analyst %s/%s: sentence over budget (%d words), keeping",
            role, ticker, _word_count(sentence),
        )

    return AnalystOutput(sentence=sentence, is_quiet=False)


def _claude_one_shot(prompt: str, *, max_tokens: int) -> str:
    from anthropic import Anthropic

    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    parts = [b.text for b in response.content if b.type == "text"]
    return "\n".join(parts).strip().strip('"').strip("'")

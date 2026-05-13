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
from api._advisor_guard import RETRY_SUFFIX_EN, RETRY_SUFFIX_ZH, has_forbidden
from api.data import prices
from api.i18n import DEFAULT_LOCALE, Locale, prompt_version_with_locale

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
# v2-no-em-dash → v3-no-em-dash (2026-05-10): locale-aware prompts.
# v3-no-em-dash → v4-source-edit (2026-05-13): ported the digest v6
# source-edit pairs into _PROMPT (en) + _LANG_INSTRUCTION["zh"], adapted
# to the snapshot surface: (1) no pace characterization on top-N share
# or exposure — "pace" itself banned; (2) What + Meaning lines are
# snapshot-only, no forward-look on how the shape will evolve; Watch
# line names an observation target without predicting its outcome;
# (3) ZH Watch wording nudged toward 未来/下次/下个 over 后续.
# FORBIDDEN list unchanged. Cache keys "v4-source-edit-en" /
# "v4-source-edit-zh"; old v3 rows orphan and rebuild on next request.
_PROMPT_VERSION = "v4-source-edit"

# Post-check ban tuples for FORBIDDEN retry. See _advisor_guard.py
# for matcher semantics. Concentration-specific bans add portfolio-action
# framings (rebalance / diversify / over-weight / 再平衡 / 超配) on top
# of the magnitude + hype + pace + forward-look baseline.
_BANS: dict[Locale, tuple[str, ...]] = {
    "en": (
        "forecast", "predict", "recommend", "should", "ought", "tomorrow",
        "surge", "plunge", "soar", "crash", "breakout", "rally", "tank",
        "bullish", "bearish",
        "notable", "significant", "remarkable", "impressive", "robust",
        "solid", "sharp", "stark", "dramatic", "modest", "outsized", "massive",
        "registers", "boasts", "showcases", "demonstrates", "highlights",
        "momentum", "decelerat", "mover",
        "pace", "accelerat", "slowing", "easing", "rate-of-change",
        # Concentration surface-specific:
        "rebalance", "diversify", "over-weight", "under-weight",
        "over-allocated", "under-allocated", "spread out",
        "reduce exposure", "increase exposure",
    ),
    "zh": (
        "加仓", "减仓", "清仓", "目标价", "预测", "推荐", "建议",
        "应该", "理应",
        "看多", "看涨", "看空", "看跌",
        "飙升", "暴涨", "暴跌", "大跌", "崩盘", "突破点", "反弹",
        "显著", "强劲", "疲软", "稳健", "急剧",
        "动能", "势头",
        "节奏", "放缓", "减速", "加速", "趋缓",
        # Concentration surface-specific:
        "再平衡", "分散投资", "过度集中", "分散开来",
        "降低敞口", "增加敞口",
        "超配", "低配", "过配", "欠配",
    ),
}

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
        "观察未来数月头号持仓占比与货币敞口的变化方向。",
    ),
}


_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文回答。所有结构化标签（'What:' / 'Meaning:' / 'Watch:'）保持英文以便解析。"
        "采用零售投资者的朴素中文。禁用以下中文词汇："
        "买入、卖出、持有、加仓、减仓、目标价、推荐、应该、看多、看空、"
        "飙升、暴跌、突破、反弹、显著、强劲、疲软、动能、"
        "再平衡、分散投资、过度集中、分散开来、降低敞口、增加敞口、"
        "超配、低配、过配、欠配。"
        "\n\n不要描述账本形态变化的节奏。仅写当前快照。\"节奏\" 一词本身禁用，"
        "加速、减速、放缓、趋缓亦不得用于头号持仓占比、敞口或仓位权重。"
        "\n    反例：\"头号持仓占比正在加速上升\""
        "\n    正例：\"头号持仓占账本价值 47.3%，其后四只持仓与之差距明显\""
        "\n\n\"What:\" 与 \"Meaning:\" 两行只写当前快照，不得包含对形态演变的前瞻性预期。"
        "\"Watch:\" 一行写一个观察对象，不得预测其结果。"
        "\n    反例 (Meaning)：\"账本越来越集中，这一趋势可能持续\""
        "\n    正例 (Meaning)：\"账本依赖单只持仓 K71U，其占比达 47.3%\""
        "\n    反例 (Watch)：\"头号持仓占比或将继续上升\""
        "\n    正例 (Watch)：\"观察未来数月头号持仓占比相对当前 47.3% 的变化方向\""
        "\n\nWatch 一行的时间词优先使用 \"下次/下个/未来\"，避免 \"后续\"。\n"
    ),
}

_PROMPT = """\
You are writing three short educational lines about the SHAPE of a
personal investment portfolio for a beginner investor's dashboard. The
reader is a first-year student. They already see the numeric ratios
(top-1, top-3, top-5 share, currency exposure, largest position);
this is the deeper plain-English context.

Output format, exact and machine-parsed, three lines:

What: <one sentence: describe the shape of the book in plain words.
       Name the most concentrated position and the dominant currency
       if relevant.>
Meaning: <one sentence: what the shape means in plain terms. Pattern
          or context. Avoid jargon.>
Watch: <one sentence: what to monitor as the shape changes over time
        (observation target, never an action).>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- Percentages quoted verbatim if used.
- Do not characterize the pace at which the shape is changing. Stick
  to the current snapshot. The word "pace" itself is banned, as are
  accelerating / decelerating / slowing / easing applied to top-N
  share, exposure, or position weight.
    Bad: "top-1 share has been growing at an accelerating clip"
    Good: "top-1 is 47.3% of book value, with the next four positions trailing well behind"
- The "What" and "Meaning" lines describe the current snapshot only.
  Do not state forward-looking expectations about how the shape will
  evolve. The "Watch" line names an observation target without
  predicting its outcome.
    Bad (Meaning): "the book is becoming more concentrated, and this trend may continue"
    Good (Meaning): "the book leans on one position, K71U, which makes up 47.3% of value"
    Bad (Watch):   "top-1 share will likely keep rising as K71U gains momentum"
    Good (Watch):  "Whether top-1 share moves above or below its current 47.3% over the coming months"
- NEVER use em dashes (—) in any output line. Use colons, commas, or
  periods instead.

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


def _load_cached(
    cache_key: str, locale: Locale = DEFAULT_LOCALE
) -> tuple[str, str, str, datetime] | None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM concentration_insight_cache "
            "WHERE cache_key = ? AND prompt_version = ?",
            [cache_key, pv],
        ).fetchone()
    if not row:
        return None
    what, meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return what, meaning, watch, generated_at


def _save_cache(
    cache_key: str,
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
            "INSERT OR REPLACE INTO concentration_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [cache_key, pv, what, meaning, watch, generated_at],
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
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/concentration-insight."
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
            "concentration_insight: forbidden %r in first draft, retrying (locale=%s)",
            bad, locale,
        )
        retry_suffix = (RETRY_SUFFIX_ZH if locale == "zh" else RETRY_SUFFIX_EN).format(bad=bad)
        body = _shot(system_prompt + retry_suffix)
        bad2 = has_forbidden(body, bans, locale)
        if bad2 is not None:
            log.warning(
                "concentration_insight: forbidden %r persisted after retry, quieting (locale=%s)",
                bad2, locale,
            )
            return _QUIET[locale]

    return _parse_body(body)


def get_insight(
    force_refresh: bool = False, locale: Locale = DEFAULT_LOCALE
) -> ConcentrationInsight | None:
    c = concentration.get_concentration()
    if c.count == 0:
        return None
    cache_key = _make_key(c)
    if not force_refresh:
        cached = _load_cached(cache_key, locale)
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
    what, meaning, watch = _call_claude(user_message, locale)
    now = datetime.now()
    _save_cache(cache_key, what, meaning, watch, now, locale)
    return ConcentrationInsight(
        cache_key=cache_key,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=now,
    )

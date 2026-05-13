"""Plain-English commentary on portfolio-vs-benchmark performance.

Advisor pattern: static endpoint already renders the chart + tabular
legend with no Claude required; this lazy block expands when the user
clicks [learn more] and turns the comparison into one What / Meaning /
Watch trio. Cached in `benchmark_insight_cache` keyed by
(symbols, days, as_of_date) + prompt_version.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from api import benchmark
from api.data import prices
from api.i18n import DEFAULT_LOCALE, Locale, prompt_version_with_locale

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
# v2-no-em-dash → v3-no-em-dash (2026-05-10): locale-aware prompts.
# v3-no-em-dash → v4-source-edit (2026-05-13): ported the digest v6
# source-edit pairs into _PROMPT (en) + _LANG_INSTRUCTION["zh"]:
# (1) describe what happened, not the pace of any metric (return, gap,
# recovery, rally, drawdown) — "pace" itself banned; (2) What + Meaning
# lines are past-only, no forward-look expectations; Watch line names an
# observation target without predicting its outcome; (3) ZH Watch wording
# nudged toward 未来/下次/下个 over 后续. FORBIDDEN list unchanged; fix
# at the prompt level. Old v3 rows in benchmark_insight_cache orphan and
# rebuild on next request.
_PROMPT_VERSION = "v4-source-edit"

_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文回答。所有结构化标签（'What:' / 'Meaning:' / 'Watch:'）保持英文以便解析。"
        "采用零售投资者的朴素中文。禁用以下中文词汇："
        "买入、卖出、持有、加仓、减仓、目标价、预测、推荐、应该、看多、看空、"
        "飙升、暴跌、崩盘、突破、反弹、跑赢、跑输、显著、强劲、疲软、动能。"
        "\n\n不要描述任何指标的节奏——无论是收益率、差距、回升、上行还是回撤。"
        "写发生了什么，不要说它在加速、减速、放缓或趋缓。\"节奏\" 一词本身禁用。"
        "\n    反例：\"组合回升的节奏较 SPY 放缓\""
        "\n    正例：\"在相同的 30 天窗口内，组合上涨 4.3%，SPY 上涨 7.1%\""
        "\n\n\"What:\" 与 \"Meaning:\" 两行只写已发生的事实，不得包含前瞻性预期。"
        "\"Watch:\" 一行写一个观察对象，不得预测其结果。"
        "\n    反例 (Meaning)：\"随着 SPY 继续上行，差距可能进一步扩大\""
        "\n    正例 (Meaning)：\"窗口内组合与 SPY 的差距从 1.2% 扩大至 2.8%\""
        "\n    反例 (Watch)：\"SPY 下个月或将继续领先组合\""
        "\n    正例 (Watch)：\"观察未来一个月组合与 SPY 的差距是收窄还是扩大\""
        "\n\nWatch 一行的时间词优先使用 \"下次/下个/未来\"，避免 \"后续\"。\n"
    ),
}

_PROMPT = """\
You are writing three short educational lines about a personal-portfolio
performance comparison for a beginner investor's dashboard. The reader
is a first-year student. They already see the chart and the percentage
change for each line; this is the deeper plain-English context.

Output format, exact and machine-parsed, three lines:

What: <one sentence: describe the relationship between the portfolio
       line and each benchmark line over the window. Plain everyday
       words, no jargon.>
Meaning: <one sentence: what the relationship means in plain terms.
          Pattern, comparison, or context. Avoid jargon.>
Watch: <one sentence: what to monitor going forward as an observation
        target, never an action.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- Percentages quoted verbatim if used. The educational point is
  qualitative; the numbers stand on their own.
- Do not characterize the pace of any metric — return, gap, recovery,
  rally, drawdown. Describe what happened, not whether it is
  accelerating, decelerating, slowing, or easing. The word "pace"
  itself is banned.
    Bad: "the portfolio's pace of recovery has slowed compared to SPY"
    Good: "the portfolio gained 4.3% while SPY gained 7.1% over the same 30-day window"
- The "What" and "Meaning" lines are past-only. Stick to what has
  happened over the window. Do not state forward-looking expectations.
  The "Watch" line names an observation target without predicting its
  outcome.
    Bad (Meaning): "the gap may widen further as SPY keeps climbing"
    Good (Meaning): "the gap between the portfolio and SPY widened from 1.2% to 2.8% over the window"
    Bad (Watch):   "SPY will likely outpace the portfolio next month"
    Good (Watch):  "Whether the gap between the portfolio and SPY narrows or widens over the next month"
- NEVER use em dashes (—) in any output line. Use colons, commas, or
  periods instead.

NEVER use these action words:
  buy / sell / hold / trim / add / target / forecast / predict / expect /
  recommend / "you should" / "you ought" / "consider [verb]" / "tomorrow".

NEVER use these hype words:
  surge / plunge / soar / crash / breakout / rally / tank.

Translate concepts: never use alpha / beta / outperform / underperform /
benchmark-beating / track-record / risk-adjusted. Plain everyday English
only; describe shape and direction, not finance theory.

Tone: matter-of-fact, calm. Like a patient teacher writing one note in
a personal ledger.

Output the three lines only. No preamble, no markdown, no bullets.
"""


@dataclass(frozen=True)
class BenchmarkInsight:
    cache_key: str
    days: int
    symbols: list[str]
    what: str
    meaning: str
    watch: str
    generated_at: datetime
    cached: bool = False


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS benchmark_insight_cache (
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


def _make_key(symbols: list[str], days: int) -> str:
    return f"{','.join(sorted(symbols))}|{days}|{date.today().isoformat()}"


def _load_cached(
    cache_key: str, locale: Locale = DEFAULT_LOCALE
) -> tuple[str, str, str, datetime] | None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM benchmark_insight_cache "
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
            "INSERT OR REPLACE INTO benchmark_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [cache_key, pv, what, meaning, watch, generated_at],
        )


def _format_pct(value: float) -> str:
    sign = "+" if value > 0 else ""
    return f"{sign}{value * 100:.2f}%"


def _build_user_message(days: int, portfolio_final: float, benches: dict[str, float]) -> str:
    parts = [
        f"Window: last {days} days.",
        f"Portfolio total return over window: {_format_pct(portfolio_final)}.",
        "Benchmarks:",
    ]
    for sym, pct in benches.items():
        parts.append(f"  - {sym}: {_format_pct(pct)}")
    return "\n".join(parts)


def _call_claude(
    user_message: str, locale: Locale = DEFAULT_LOCALE
) -> tuple[str, str, str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/benchmark-insight."
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")

    system_prompt = _PROMPT + _LANG_INSTRUCTION[locale]

    response = client.messages.create(
        model=model,
        max_tokens=400,
        system=system_prompt,
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


def get_insight(
    days: int,
    symbols: list[str],
    force_refresh: bool = False,
    locale: Locale = DEFAULT_LOCALE,
) -> BenchmarkInsight | None:
    cache_key = _make_key(symbols, days)
    if not force_refresh:
        cached = _load_cached(cache_key, locale)
        if cached is not None:
            what, meaning, watch, gen_at = cached
            return BenchmarkInsight(
                cache_key=cache_key,
                days=days,
                symbols=symbols,
                what=what,
                meaning=meaning,
                watch=watch,
                generated_at=gen_at,
                cached=True,
            )

    portfolio = benchmark.compute_portfolio_series(
        days=days,
        calendar=[p.trade_date for p in benchmark.get_series(symbols[0], days)],
    )
    if not portfolio:
        return None
    final_pct = portfolio[-1].pct

    benches: dict[str, float] = {}
    for sym in symbols:
        series = benchmark.get_series(sym, days)
        if series:
            benches[sym] = series[-1].pct

    user_message = _build_user_message(days, final_pct, benches)
    what, meaning, watch = _call_claude(user_message, locale)
    now = datetime.now()
    _save_cache(cache_key, what, meaning, watch, now, locale)
    return BenchmarkInsight(
        cache_key=cache_key,
        days=days,
        symbols=symbols,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=now,
    )

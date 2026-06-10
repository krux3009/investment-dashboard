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
from api._advisor_guard import (
    FORBIDDEN_HYPE,
    RETRY_SUFFIX_HYPE_EN,
    RETRY_SUFFIX_HYPE_ZH,
    has_forbidden,
)
from api.data import prices
from api.i18n import DEFAULT_LOCALE, Locale, prompt_version_with_locale

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
# v2-no-em-dash → v3-no-em-dash (2026-05-10): locale-aware prompts.
# v3-no-em-dash → v4-source-edit (2026-05-13): ported the digest v6
# source-edit pairs (pace / forward-look / magnitude bans).
# v4-source-edit → v5-recommend (2026-06-06): dropped the educational-only
# guardrail. Prose may now be directional and actionable (add / trim /
# hold / rebalance), kept calm and grounded. Removed the action-word,
# magnitude, pace, and forward-look bans plus the benchmark-specific
# alpha/beta/outperform ban; the only surviving post-check is the slim
# anti-hype list (_BANS = FORBIDDEN_HYPE). Old v4 rows in
# benchmark_insight_cache orphan and rebuild on next request.
_PROMPT_VERSION = "v5-recommend"

# Post-check ban tuples for FORBIDDEN retry. See _advisor_guard.py for
# matcher semantics. Only the slim anti-hype list survives the move to
# direct recommendations: the model may give a directional view but
# never pump.
_BANS: dict[Locale, tuple[str, ...]] = FORBIDDEN_HYPE

# Quiet fallback when both Claude attempts produce a forbidden hit.
_QUIET: dict[Locale, tuple[str, str, str]] = {
    "en": (
        "The portfolio and benchmark lines moved through the window with measurable differences.",
        "The chart and tabular legend already show the relative sizes of those differences.",
        "How the gap between the lines changes over the next window of the same length.",
    ),
    "zh": (
        "在该窗口内，组合与基准走势之间存在可量化的差距。",
        "图表与下方表格已展示这些差距的相对大小。",
        "未来同等长度窗口内，组合与基准之间差距的变化方向。",
    ),
}


_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文回答。所有结构化标签（'What:' / 'Meaning:' / 'Watch:'）保持英文以便解析。"
        "采用零售投资者的朴素中文。可以给出明确、可执行的方向性看法"
        "（例如加仓、减仓、持有或再平衡），但须保持冷静、有据的口吻：不得夸大、保证或断言必然。"
        "\n\nWatch 一行的时间词优先使用 \"下次/下个/未来\"，避免 \"后续\"。\n"
    ),
}

_PROMPT = """\
You are writing three short lines about a personal-portfolio performance
comparison for a long-horizon investor's dashboard. They already see the
chart and the percentage change for each line; this is the deeper
plain-English context.

You may give a direct, actionable view (e.g. whether to add to, trim,
hold, or rebalance the book). Keep it calm and grounded: no hype, no
guarantees, no certainty claims. The reader makes the final decision.

Output format, exact and machine-parsed, three lines:

What: <one sentence: describe the relationship between the portfolio
       line and each benchmark line over the window. Plain everyday
       words, no jargon.>
Meaning: <one sentence: what the relationship means in plain terms.
          Pattern, comparison, or context. Avoid jargon.>
Watch: <one sentence: what this suggests you might do or keep an eye on
        as you decide; a concrete, actionable takeaway is welcome.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- Percentages quoted verbatim if used.
- NEVER use em dashes (—) in any output line. Use colons, commas, or
  periods instead.

Tone: matter-of-fact, calm. Like a steady hand writing one note in a
personal ledger. Plain everyday English; describe shape and direction
clearly, then say what you'd do.

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
    """Returns (what, meaning, watch). Runs the FORBIDDEN post-check
    + one retry; falls back to the locale-specific quiet template on
    repeated violation.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/benchmark-insight."
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
            "benchmark_insight: hype %r in first draft, retrying (locale=%s)",
            bad, locale,
        )
        retry_suffix = (
            RETRY_SUFFIX_HYPE_ZH if locale == "zh" else RETRY_SUFFIX_HYPE_EN
        ).format(bad=bad)
        body = _shot(system_prompt + retry_suffix)
        bad2 = has_forbidden(body, bans, locale)
        if bad2 is not None:
            log.warning(
                "benchmark_insight: hype %r persisted after retry, quieting (locale=%s)",
                bad2, locale,
            )
            return _QUIET[locale]

    return _parse_body(body)


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

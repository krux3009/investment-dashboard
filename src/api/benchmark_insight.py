"""Plain-English commentary on portfolio-vs-benchmark performance.

Advisor pattern: static endpoint already renders the chart + tabular
legend with no Claude required; this lazy block expands when the user
clicks [learn more] and turns the comparison into one What / Meaning /
Watch trio. Engine (client, guard, cache) lives in `api.advisor`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from api import advisor, benchmark
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

_SPEC = advisor.AdvisorSpec(
    surface="benchmark-insight",
    prompt=_PROMPT,
    prompt_version=_PROMPT_VERSION,
    ttl=timedelta(hours=6),
)


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


def _make_key(symbols: list[str], days: int) -> str:
    return f"{','.join(sorted(symbols))}|{days}|{date.today().isoformat()}"


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


def get_insight(
    days: int,
    symbols: list[str],
    force_refresh: bool = False,
    locale: Locale = DEFAULT_LOCALE,
) -> BenchmarkInsight | None:
    cache_key = _make_key(symbols, days)
    if not force_refresh:
        cached = advisor.load(_SPEC, cache_key, locale)
        if cached is not None:
            payload, gen_at = cached
            return BenchmarkInsight(
                cache_key=cache_key,
                days=days,
                symbols=symbols,
                what=payload["what"],
                meaning=payload["meaning"],
                watch=payload["watch"],
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
    body = advisor.complete(_SPEC, user_message, locale)
    if body is None:
        what, meaning, watch = _QUIET[locale]
    else:
        what, meaning, watch = advisor.parse_wmw(body)
    now = advisor.save(
        _SPEC, cache_key, {"what": what, "meaning": meaning, "watch": watch}, locale
    )
    return BenchmarkInsight(
        cache_key=cache_key,
        days=days,
        symbols=symbols,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=now,
    )

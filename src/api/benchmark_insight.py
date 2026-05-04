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

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
_PROMPT_VERSION = "v1"

_PROMPT = """\
You are writing three short educational lines about a personal-portfolio
performance comparison for a beginner investor's dashboard. The reader
is a first-year student. They already see the chart and the percentage
change for each line; this is the deeper plain-English context.

Output format — exact, machine-parsed, three lines:

What: <one sentence — describe the relationship between the portfolio
       line and each benchmark line over the window. Plain everyday
       words, no jargon.>
Meaning: <one sentence — what the relationship means in plain terms.
          Pattern, comparison, or context. Avoid jargon.>
Watch: <one sentence — what to monitor going forward as an observation
        target, never an action.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- Percentages quoted verbatim if used. The educational point is
  qualitative — the numbers stand on their own.

NEVER use these action words:
  buy / sell / hold / trim / add / target / forecast / predict / expect /
  recommend / "you should" / "you ought" / "consider [verb]" / "tomorrow".

NEVER use these hype words:
  surge / plunge / soar / crash / breakout / rally / tank.

Translate concepts: never use alpha / beta / outperform / underperform /
benchmark-beating / track-record / risk-adjusted. Plain everyday English
only — describe shape and direction, not finance theory.

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


def _load_cached(cache_key: str) -> tuple[str, str, str, datetime] | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM benchmark_insight_cache "
            "WHERE cache_key = ? AND prompt_version = ?",
            [cache_key, _PROMPT_VERSION],
        ).fetchone()
    if not row:
        return None
    what, meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return what, meaning, watch, generated_at


def _save_cache(cache_key: str, what: str, meaning: str, watch: str, generated_at: datetime) -> None:
    _ensure_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO benchmark_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [cache_key, _PROMPT_VERSION, what, meaning, watch, generated_at],
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


def _call_claude(user_message: str) -> tuple[str, str, str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/benchmark-insight."
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")

    response = client.messages.create(
        model=model,
        max_tokens=320,
        system=_PROMPT,
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


def get_insight(days: int, symbols: list[str], force_refresh: bool = False) -> BenchmarkInsight | None:
    cache_key = _make_key(symbols, days)
    if not force_refresh:
        cached = _load_cached(cache_key)
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
    what, meaning, watch = _call_claude(user_message)
    now = datetime.now()
    _save_cache(cache_key, what, meaning, watch, now)
    return BenchmarkInsight(
        cache_key=cache_key,
        days=days,
        symbols=symbols,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=now,
    )

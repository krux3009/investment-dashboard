"""Per-report educational block for upcoming earnings.

Lives behind the [learn more] affordance on each row of the upcoming-
earnings strip. The strip itself shows plain-English labels statically;
this module produces the deeper Claude-generated read for one specific
report, mirroring the per-stock api.insight pattern.

Returns three short labelled lines:
  what    — one sentence saying what an earnings report is, framed for
            this specific company.
  meaning — one sentence on what these particular estimate numbers mean
            (size of profit, scale of revenue, negative-EPS framing for
            unprofitable growth, etc.)
  watch   — one sentence naming an observation target for when results
            actually land.

Cached in `prices.duckdb` table `earnings_insight_cache`, keyed by
(code, prompt_version). 24h TTL. Earnings estimates change rarely so
this is generous; bump `_PROMPT_VERSION` to invalidate.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import earnings as earnings_module
from api.data import prices

log = logging.getLogger(__name__)

_TTL = timedelta(hours=24)
_PROMPT_VERSION = "v1"

_PROMPT = """\
You are writing three short educational lines about ONE upcoming
earnings report for a beginner investor's dashboard. The reader is a
first-year student who has never invested. They have already seen a
plain-English summary line (date + analyst expectations) on the page;
this is the deeper explanation when they click "learn more".

Output format — exact, machine-parsed, three lines:

What: <one sentence — what an earnings report is, framed for THIS company.>
Meaning: <one sentence — what these specific estimate numbers point to (size of profit, scale of revenue, what a negative number would mean, etc.)>
Watch: <one sentence — what to monitor when results actually land. Frame as observation targets, not actions.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:", "Meaning:",
  "Watch:".
- Each line is ONE sentence, ≤30 words.
- Quote the company name + ticker + date verbatim if you use them.
- Quote the exact estimate numbers if you reference them.

NEVER use these terms — translate them first:
  EPS                       → "profit per share"
  top line                  → "total sales" or "revenue"
  bottom line               → "profit"
  beat / beats / beat estimates  → "came in higher than expected"
  miss / misses / missed estimates → "came in lower than expected"
  guidance                  → "what the company expects for the next 3 months"
  street / Wall Street      → "investors and analysts"
  consensus                 → "the average expectation"
  earnings season           → "the time when many companies report at once"

NEVER use action words:
  buy / sell / hold / trim / add / target / forecast / predict / expect
  / recommend / "you should" / "you ought" / "consider [verb]".

NEVER use hype words:
  surge / plunge / soar / crash / breakout / rally / tank.

The "Watch" line names a future observation target, NOT an action.
Examples of the right shape:
- "Watch how the actual profit per share compares to the estimated
  $0.81 — bigger gaps in either direction often move the price."
- "Watch what the company says about the next 3 months — that often
  matters more than the quarterly number itself."
- "Watch whether sales growth slows compared to last quarter."
Never: "consider buying", "consider selling", "look to add".

Tone: matter-of-fact, calm, considered. Like a patient teacher writing
one note in a personal ledger.

Output the three lines only. No preamble, no markdown, no bullet
characters.
"""


@dataclass(frozen=True)
class EarningsInsight:
    code: str
    ticker: str
    what: str
    meaning: str
    watch: str
    generated_at: datetime
    cached: bool = False


# ── Cache ────────────────────────────────────────────────────────────────────


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS earnings_insight_cache (
                code VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                what VARCHAR,
                meaning VARCHAR,
                watch VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (code, prompt_version)
            )
            """
        )


def _load_cached(code: str) -> EarningsInsight | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM earnings_insight_cache "
            "WHERE code = ? AND prompt_version = ?",
            [code, _PROMPT_VERSION],
        ).fetchone()
    if not row:
        return None
    what, meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return EarningsInsight(
        code=code,
        ticker=code.split(".", 1)[-1],
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=generated_at,
        cached=True,
    )


def _save_cache(insight: EarningsInsight) -> None:
    _ensure_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO earnings_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [
                insight.code,
                _PROMPT_VERSION,
                insight.what,
                insight.meaning,
                insight.watch,
                insight.generated_at,
            ],
        )


# ── User-message builder ────────────────────────────────────────────────────


def _format_money(value: float | None) -> str:
    if value is None:
        return "n/a"
    abs_v = abs(value)
    sign = "-" if value < 0 else ""
    if abs_v >= 1_000_000_000:
        return f"{sign}${abs_v / 1_000_000_000:.2f}B"
    if abs_v >= 1_000_000:
        return f"{sign}${abs_v / 1_000_000:.2f}M"
    return f"{sign}${abs_v:.2f}"


def _build_user_message(e: earnings_module.Earnings) -> str:
    days_phrase = (
        "today"
        if e.days_until == 0
        else "tomorrow"
        if e.days_until == 1
        else f"in {e.days_until} days"
    )
    eps_phrase = (
        f"about {_format_money(e.eps_avg)} per share"
        if e.eps_avg is not None
        else "no estimate available"
    )
    if e.eps_avg is not None and e.eps_avg < 0:
        eps_phrase = (
            f"a loss of about {_format_money(abs(e.eps_avg))} per share"
        )
    revenue_phrase = (
        f"about {_format_money(e.revenue_avg)} in total sales"
        if e.revenue_avg is not None
        else "no revenue estimate available"
    )

    return (
        f"Company: {e.name} ({e.ticker})\n"
        f"Report date: {e.date} ({days_phrase})\n"
        f"Analyst expectation: {eps_phrase} and {revenue_phrase}.\n"
        f"Estimate range — profit per share: "
        f"{_format_money(e.eps_low)} to {_format_money(e.eps_high)}; "
        f"total sales: {_format_money(e.revenue_low)} to "
        f"{_format_money(e.revenue_high)}.\n"
    )


# ── Claude call ─────────────────────────────────────────────────────────────


def _call_claude(user_message: str) -> tuple[str, str, str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable "
            "/api/earnings-insight."
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")

    response = client.messages.create(
        model=model,
        max_tokens=400,
        system=_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    body = "\n".join(b.text for b in response.content if b.type == "text").strip()

    what = ""
    meaning = ""
    watch = ""
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
        # Model drifted from the format — surface raw body as `what` so
        # the panel still renders.
        what = body
    return what, meaning, watch


# ── Public API ──────────────────────────────────────────────────────────────


def get_earnings_insight(code: str, force_refresh: bool = False) -> EarningsInsight | None:
    """Return per-report insight for a held ticker with an upcoming report.
    Returns None if no upcoming earnings record exists for `code`.
    """
    if not force_refresh:
        cached = _load_cached(code)
        if cached is not None:
            return cached

    record = next(
        (e for e in earnings_module.get_all() if e.code == code),
        None,
    )
    if record is None:
        return None

    user_message = _build_user_message(record)
    what, meaning, watch = _call_claude(user_message)
    insight = EarningsInsight(
        code=code,
        ticker=record.ticker,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=datetime.now(),
    )
    _save_cache(insight)
    return insight

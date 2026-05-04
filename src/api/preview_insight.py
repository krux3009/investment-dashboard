"""Per-symbol educational block for the tomorrow's-preview surface.

Lives behind the [learn more] affordance on each row of the preview
block. Mirrors api.earnings_insight: returns three short labelled
lines (what, meaning, watch) and caches in DuckDB, keyed by
(symbol, prompt_version). 1-hour TTL — preview data refreshes
quickly, so we want fresh teaching even after a single market session.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import preview as preview_module
from api.data import prices

log = logging.getLogger(__name__)

_TTL = timedelta(hours=1)
_PROMPT_VERSION = "v1"

_PROMPT = """\
You are writing three short educational lines about ONE row of an
"upcoming US market open" snapshot for a beginner investor's dashboard.
The reader is a first-year student who has never invested. They have
already seen a one-line label + percent move on the page; this is the
deeper explanation when they click "learn more".

Output format — exact, machine-parsed, three lines:

What: <one sentence — what this row tracks, in everyday words.>
Meaning: <one sentence — what today's percentage move suggests, in plain English. Tie to the SIZE of the move (small / moderate / large).>
Watch: <one sentence — what to monitor when the US market opens or as the day continues. Frame as observation targets, not actions.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:", "Meaning:",
  "Watch:".
- Each line ONE sentence, ≤30 words.
- Quote the symbol + label + percentage figure verbatim if you use them.

NEVER use these terms — translate them first:
  futures contract       → "an agreement priced now for delivery later"
  basis points / bps     → "hundredths of a percent"
  pre-market             → "the hours before the US market opens"
  post-market / after-hours → "the hours after the US market closes"
  bull / bear / bullish / bearish → "rising" / "falling" / "trending up" / "trending down"
  rally / sell-off / risk-on / risk-off / sentiment shift
                         → describe the direction in plain words instead
  index                  → "a basket of stocks tracked together"
  Asia open / Asia close → "the start / end of the trading day in Asia"

NEVER use action words:
  buy / sell / hold / trim / add / target / forecast / predict / expect
  / recommend / "you should" / "you ought" / "consider [verb]".

NEVER use hype words:
  surge / plunge / soar / crash / breakout / rally / tank.

A tiny move (< 0.25%) is "small / barely a move". A moderate move
(0.25%–1.0%) is "noticeable but not large". A move > 1.0% is "a
meaningful shift". Use this calibration when describing size; do not
imply a small move is dramatic.

The "Watch" line names a future observation target. Phrase as what
would matter, not what to do. Examples:
- "Whether the move holds into the US open or fades."
- "How the actual US open compares to this overnight signal."
- "Whether the rest of Asia follows or diverges from this read."
Never: "consider buying", "consider selling", "look to add".

Tone: matter-of-fact, calm, considered. Like a patient teacher writing
one note in a personal ledger.

Output the three lines only. No preamble, no markdown, no bullet
characters.
"""


@dataclass(frozen=True)
class PreviewInsight:
    symbol: str
    label: str
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
            CREATE TABLE IF NOT EXISTS preview_insight_cache (
                symbol VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                label VARCHAR,
                what VARCHAR,
                meaning VARCHAR,
                watch VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (symbol, prompt_version)
            )
            """
        )


def _load_cached(symbol: str) -> PreviewInsight | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT label, what, meaning, watch, generated_at "
            "FROM preview_insight_cache "
            "WHERE symbol = ? AND prompt_version = ?",
            [symbol, _PROMPT_VERSION],
        ).fetchone()
    if not row:
        return None
    label, what, meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return PreviewInsight(
        symbol=symbol,
        label=label,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=generated_at,
        cached=True,
    )


def _save_cache(insight: PreviewInsight) -> None:
    _ensure_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO preview_insight_cache VALUES "
            "(?, ?, ?, ?, ?, ?, ?)",
            [
                insight.symbol,
                _PROMPT_VERSION,
                insight.label,
                insight.what,
                insight.meaning,
                insight.watch,
                insight.generated_at,
            ],
        )


# ── Claude call ─────────────────────────────────────────────────────────────


def _build_user_message(row: preview_module.PreviewRow) -> str:
    pct_str = f"{row.change_pct * 100:+.2f}%"
    return (
        f"Symbol: {row.symbol}\n"
        f"Label: {row.label}\n"
        f"Last price: {row.last_price:,.2f}\n"
        f"Previous close: {row.previous_close:,.2f}\n"
        f"Change: {pct_str} since last close\n"
    )


def _call_claude(user_message: str) -> tuple[str, str, str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable "
            "/api/preview-insight."
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
        what = body
    return what, meaning, watch


# ── Public API ──────────────────────────────────────────────────────────────


def get_preview_insight(symbol: str, force_refresh: bool = False) -> PreviewInsight | None:
    """Return per-symbol preview insight. None if symbol isn't in our list."""
    if not force_refresh:
        cached = _load_cached(symbol)
        if cached is not None:
            return cached

    snapshot = preview_module.get_preview()
    row = next((r for r in snapshot.rows if r.symbol == symbol), None)
    if row is None:
        return None

    user_message = _build_user_message(row)
    what, meaning, watch = _call_claude(user_message)
    insight = PreviewInsight(
        symbol=symbol,
        label=row.label,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=datetime.now(),
    )
    _save_cache(insight)
    return insight

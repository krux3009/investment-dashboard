"""Per-ticker scheduled-events fetcher (Claude advisor pattern).

Asks Claude for *publicly-announced* upcoming events: scheduled product
launches, investor days, conference talks (CES / GTC / JPM Healthcare),
pre-announced earnings call dates, board meetings, lock-up expirations.
No speculation — confirmed dates only.

Cached in `prices.duckdb` table `company_events_cache`, 24h TTL,
keyed by (code, prompt_version). Bump _PROMPT_VERSION to invalidate.
Empty results are also cached so we don't re-call Claude for tickers
that genuinely have nothing scheduled.

503 (missing ANTHROPIC_API_KEY) propagates to caller; foresight.py
swallows it and continues with earnings + macro only.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta

from api.data import prices

log = logging.getLogger(__name__)

_TTL = timedelta(hours=24)
_PROMPT_VERSION = "v1"


_PROMPT = """\
You are listing publicly-announced upcoming events for ONE stock for a
beginner investor's dashboard. The reader holds this stock; the events
help them know what's on the calendar.

Include only events that have been ANNOUNCED with a SPECIFIC DATE:
  - Scheduled product launches (e.g. "iPhone 17 launch event")
  - Investor days / capital markets days
  - Pre-announced earnings call dates (NOT the earnings release itself —
    the dashboard already covers that separately)
  - Confirmed scheduled conference talks (CES, NVIDIA GTC, JPM Healthcare,
    industry conferences) where the company is presenting
  - Scheduled board meetings (rare — only if pre-announced and material)
  - Lock-up expiration dates (recent IPO / SPAC)

DO NOT include:
  - Speculative or rumored events
  - Earnings dates (handled elsewhere)
  - Ex-dividend dates
  - Generic industry conferences without confirmed company presence
  - Anything you are not confident is publicly announced

Output format — STRICT JSON ONLY, no preamble, no markdown, no prose:

[
  {"date": "YYYY-MM-DD", "kind": "product|investor_day|conference|earnings_call|board|lockup|other",
   "label": "<short title under 60 chars>",
   "description": "<one factual sentence under 30 words>"}
]

If no confirmed events exist, output exactly: []
"""


@dataclass(frozen=True)
class CompanyEvent:
    date: str
    kind: str
    label: str
    description: str


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS company_events_cache (
                code VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                payload VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (code, prompt_version)
            )
            """
        )


def _load_cached(code: str) -> list[CompanyEvent] | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT payload, generated_at FROM company_events_cache "
            "WHERE code = ? AND prompt_version = ?",
            [code, _PROMPT_VERSION],
        ).fetchone()
    if not row:
        return None
    payload, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    try:
        items = json.loads(payload) if payload else []
    except Exception:
        return None
    return [CompanyEvent(**i) for i in items]


def _save_cache(code: str, events: list[CompanyEvent]) -> None:
    _ensure_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO company_events_cache VALUES (?, ?, ?, ?)",
            [
                code,
                _PROMPT_VERSION,
                json.dumps([asdict(e) for e in events]),
                datetime.now(),
            ],
        )


def _call_claude(user_message: str) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable company events."
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")

    response = client.messages.create(
        model=model,
        max_tokens=512,
        system=_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    return "\n".join(b.text for b in response.content if b.type == "text").strip()


def _parse(body: str) -> list[CompanyEvent]:
    body = body.strip()
    if body.startswith("```"):
        body = body.strip("`")
        if body.startswith("json"):
            body = body[4:]
        body = body.strip()
    try:
        items = json.loads(body)
    except Exception as exc:
        log.warning("company_events JSON parse failed: %s · body=%r", exc, body[:200])
        return []
    if not isinstance(items, list):
        return []
    out: list[CompanyEvent] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            date.fromisoformat(item["date"])
        except Exception:
            continue
        out.append(
            CompanyEvent(
                date=item["date"],
                kind=str(item.get("kind", "other"))[:32],
                label=str(item.get("label", ""))[:80],
                description=str(item.get("description", ""))[:240],
            )
        )
    return out


def get_for_ticker(code: str, ticker: str, name: str, days_window: int = 30) -> list[CompanyEvent]:
    cached = _load_cached(code)
    if cached is not None:
        return cached

    today = date.today()
    horizon = today + timedelta(days=days_window)
    user_message = (
        f"Stock: {ticker} ({code}, {name})\n"
        f"Window: {today.isoformat()} to {horizon.isoformat()}\n"
        "List confirmed publicly-announced events in this window."
    )
    try:
        body = _call_claude(user_message)
    except RuntimeError:
        raise
    except Exception as exc:
        log.warning("company_events Claude call failed for %s: %s", code, exc)
        _save_cache(code, [])
        return []

    events = _parse(body)
    _save_cache(code, events)
    return events

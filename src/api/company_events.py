"""Per-ticker scheduled-events fetcher (Claude advisor pattern).

Asks Claude for *publicly-announced* upcoming events: scheduled product
launches, investor days, conference talks (CES / GTC / JPM Healthcare),
pre-announced earnings call dates, board meetings, lock-up expirations.
No speculation — confirmed dates only.

Cached in the shared DuckDB KV cache (`kv_company_events`), 24h TTL,
keyed per (code, prompt_version, locale). Bump _PROMPT_VERSION to
invalidate. Empty results from a SUCCESSFUL Claude call are cached so we
don't re-call for tickers with genuinely nothing scheduled; a failed
call is NOT cached (previously a transient failure poisoned the cache
with `[]` for 24h).

503 (missing ANTHROPIC_API_KEY) propagates to caller; foresight.py
swallows it and continues with earnings + macro only. Engine lives in
`api.advisor`.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import date, timedelta

from api import advisor
from api.i18n import DEFAULT_LOCALE, Locale

log = logging.getLogger(__name__)

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

_SPEC = advisor.AdvisorSpec(
    surface="company-events",
    prompt=_PROMPT,
    prompt_version=_PROMPT_VERSION,
    ttl=timedelta(hours=24),
    max_tokens=512,
    # Locale is handled with an inline user-message note (JSON keys stay
    # English); empty ban tuples skip the hype guard — factual JSON only.
    lang_instruction={"en": "", "zh": ""},
    bans={"en": (), "zh": ()},
)


@dataclass(frozen=True)
class CompanyEvent:
    date: str
    kind: str
    label: str
    description: str


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


def get_for_ticker(
    code: str,
    ticker: str,
    name: str,
    days_window: int = 30,
    locale: Locale = DEFAULT_LOCALE,
    force_refresh: bool = False,
) -> list[CompanyEvent]:
    if not force_refresh:
        cached = advisor.load(_SPEC, code, locale)
        if cached is not None:
            payload, _gen_at = cached
            return [CompanyEvent(**i) for i in payload]

    today = date.today()
    horizon = today + timedelta(days=days_window)
    lang_note = (
        "\nWrite the `label` and `description` values in Simplified Chinese "
        "(简体中文); keep the JSON keys, `date`, and `kind` values unchanged."
        if locale == "zh"
        else ""
    )
    user_message = (
        f"Stock: {ticker} ({code}, {name})\n"
        f"Window: {today.isoformat()} to {horizon.isoformat()}\n"
        "List confirmed publicly-announced events in this window."
        f"{lang_note}"
    )
    try:
        body = advisor.complete(_SPEC, user_message, locale)
    except RuntimeError:
        raise
    except Exception as exc:
        # Transient failure: return empty WITHOUT caching so the next
        # request retries instead of serving a poisoned [] for 24h.
        log.warning("company_events Claude call failed for %s: %s", code, exc)
        return []

    events = _parse(body or "")
    advisor.save(_SPEC, code, [asdict(e) for e in events], locale)
    return events

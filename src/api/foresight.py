"""Foresight aggregator — merges earnings + macro + company events into
one chronological timeline filtered to a date window.

Each resulting event carries a stable `event_id` so /foresight-insight
can cache its What/Meaning/Watch trio. The aggregator itself is cheap:
it just unions three already-cached sources.

Failure modes: a single source raising should not break the whole
response. company_events is the most likely to 503 (missing API key);
earnings + macro are filesystem/cache-backed and always available.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date

from api import company_events, earnings, macro_events
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ForesightEvent:
    event_id: str
    date: str
    days_until: int
    kind: str           # "earnings" | "macro" | "company_event"
    code: str | None
    ticker: str | None
    label: str
    description: str


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def _make_event_id(kind: str, code: str | None, date_str: str, label: str) -> str:
    return f"{kind}|{code or 'macro'}|{date_str}|{_slug(label)}"


def _days_until(date_str: str) -> int:
    return (date.fromisoformat(date_str) - date.today()).days


def get_foresight(days: int) -> tuple[list[ForesightEvent], list[str]]:
    """Returns (events sorted by date, holdings_covered tickers)."""
    out: list[ForesightEvent] = []

    summary = get_summary()
    held_tickers = [p.ticker for p in summary.positions]

    # Earnings — already date-filtered by days_until in earnings.get_all().
    try:
        for e in earnings.get_all():
            if e.days_until > days or e.days_until < 0:
                continue
            label = f"{e.ticker} earnings"
            description_bits: list[str] = []
            if e.eps_avg is not None:
                description_bits.append(f"EPS estimate ~${e.eps_avg:.2f}")
            if e.revenue_avg is not None:
                description_bits.append(f"revenue estimate ~${e.revenue_avg / 1e9:.2f}B")
            description = (
                f"Quarterly results for {e.name}."
                + (f" {' · '.join(description_bits)}." if description_bits else "")
            )
            out.append(
                ForesightEvent(
                    event_id=_make_event_id("earnings", e.code, e.date, label),
                    date=e.date,
                    days_until=e.days_until,
                    kind="earnings",
                    code=e.code,
                    ticker=e.ticker,
                    label=label,
                    description=description,
                )
            )
    except Exception as exc:
        log.warning("earnings stream failed in foresight: %s", exc)

    # Macro — static JSON.
    try:
        for m in macro_events.get_within(days):
            out.append(
                ForesightEvent(
                    event_id=_make_event_id("macro", None, m.date, m.label),
                    date=m.date,
                    days_until=_days_until(m.date),
                    kind="macro",
                    code=None,
                    ticker=None,
                    label=m.label,
                    description=m.description,
                )
            )
    except Exception as exc:
        log.warning("macro stream failed in foresight: %s", exc)

    # Company events — Claude per-ticker, fan out across the held book.
    for p in summary.positions:
        try:
            ticker_events = company_events.get_for_ticker(
                code=p.code, ticker=p.ticker, name=p.name, days_window=30
            )
        except RuntimeError:
            # ANTHROPIC_API_KEY missing — skip silently, other streams still ship.
            continue
        except Exception as exc:
            log.warning("company_events failed for %s: %s", p.code, exc)
            continue
        for ev in ticker_events:
            try:
                du = _days_until(ev.date)
            except ValueError:
                continue
            if du > days or du < 0:
                continue
            out.append(
                ForesightEvent(
                    event_id=_make_event_id("company_event", p.code, ev.date, ev.label),
                    date=ev.date,
                    days_until=du,
                    kind="company_event",
                    code=p.code,
                    ticker=p.ticker,
                    label=ev.label,
                    description=ev.description,
                )
            )

    out.sort(key=lambda e: (e.date, e.kind, e.code or ""))
    return out, held_tickers


def find_event(event_id: str, days: int) -> ForesightEvent | None:
    events, _ = get_foresight(days)
    return next((e for e in events if e.event_id == event_id), None)

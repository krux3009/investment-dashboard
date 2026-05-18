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
from datetime import date, timedelta

from api import company_events, dividends, earnings, macro_events
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
    today = date.today()
    return get_foresight_window(today, today + timedelta(days=days))


def get_foresight_window(
    start: date, end: date
) -> tuple[list[ForesightEvent], list[str]]:
    """Returns (events sorted by date, holdings_covered tickers) for an
    explicit date window. Past dates are honoured — trailing-month cells in
    the calendar pass a `start` earlier than today.
    """
    out: list[ForesightEvent] = []
    start_str = start.isoformat()
    end_str = end.isoformat()

    summary = get_summary()
    held_tickers = [p.ticker for p in summary.positions]

    def _in_window(d: str) -> bool:
        return start_str <= d <= end_str

    # Earnings — yfinance Ticker.calendar caps at ~90d horizon, so distant
    # `end` dates still won't surface earnings beyond yfinance's data ceiling.
    try:
        for e in earnings.get_all():
            if not _in_window(e.date):
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
                    days_until=_days_until(e.date),
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
        for m in macro_events.get_between(start, end):
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
    # The underlying fetcher is keyed on days_window=30 today; for window
    # fetches we ask for whatever covers the visible end.
    today = date.today()
    days_window = max((end - today).days, 30) if end >= today else 30
    for p in summary.positions:
        try:
            ticker_events = company_events.get_for_ticker(
                code=p.code, ticker=p.ticker, name=p.name, days_window=days_window
            )
        except RuntimeError:
            continue
        except Exception as exc:
            log.warning("company_events failed for %s: %s", p.code, exc)
            continue
        for ev in ticker_events:
            if not _in_window(ev.date):
                continue
            try:
                du = _days_until(ev.date)
            except ValueError:
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

    # Ex-dividend marks — projected next ex-date per holding.
    try:
        for item in dividends.get_portfolio().items:
            if not item.next_ex_date or not _in_window(item.next_ex_date):
                continue
            try:
                du = _days_until(item.next_ex_date)
            except ValueError:
                continue
            label = f"{item.ticker} ex-div"
            per_share = item.next_amount_per_share_native
            if per_share is not None:
                description = (
                    f"Ex-dividend date for {item.name}. "
                    f"Estimated ~{item.currency} {per_share:.4f}/share "
                    f"based on prior cadence."
                )
            else:
                description = f"Ex-dividend date for {item.name}."
            out.append(
                ForesightEvent(
                    event_id=_make_event_id("exdiv", item.code, item.next_ex_date, label),
                    date=item.next_ex_date,
                    days_until=du,
                    kind="exdiv",
                    code=item.code,
                    ticker=item.ticker,
                    label=label,
                    description=description,
                )
            )
    except Exception as exc:
        log.warning("dividends stream failed in foresight: %s", exc)

    out.sort(key=lambda e: (e.date, e.kind, e.code or ""))
    return out, held_tickers


def find_event(event_id: str, days: int) -> ForesightEvent | None:
    events, _ = get_foresight(days)
    return next((e for e in events if e.event_id == event_id), None)


def find_event_window(
    event_id: str, start: date, end: date
) -> ForesightEvent | None:
    events, _ = get_foresight_window(start, end)
    return next((e for e in events if e.event_id == event_id), None)

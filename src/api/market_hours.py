"""US Regular Trading Hours utility.

Used by the realtime SSE broadcaster to gate snapshot fetches and
emit market_status transitions. RTH = Mon–Fri 09:30–16:00
America/New_York, excluding NYSE full-day holidays. Half-day early
closes (1pm ET) are not modelled — the broadcaster runs full RTH
regardless on those days, which over-streams by ~3 hours on a
handful of dates per year. Acceptable.

Holiday list is hardcoded for 2026 + 2027. Update annually or swap
to `pandas_market_calendars` if a longer horizon is needed.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
RTH_OPEN = time(9, 30)
RTH_CLOSE = time(16, 0)

# Dates from https://www.nyse.com/markets/hours-calendars
_HOLIDAYS: frozenset[date] = frozenset({
    date(2026, 1, 1),    # New Year's Day
    date(2026, 1, 19),   # MLK Day
    date(2026, 2, 16),   # Presidents' Day
    date(2026, 4, 3),    # Good Friday
    date(2026, 5, 25),   # Memorial Day
    date(2026, 6, 19),   # Juneteenth
    date(2026, 7, 3),    # Independence Day (observed; 2026-07-04 is Saturday)
    date(2026, 9, 7),    # Labor Day
    date(2026, 11, 26),  # Thanksgiving
    date(2026, 12, 25),  # Christmas
    date(2027, 1, 1),
    date(2027, 1, 18),
    date(2027, 2, 15),
    date(2027, 3, 26),
    date(2027, 5, 31),
    date(2027, 6, 18),
    date(2027, 7, 5),    # Independence Day (observed; 2027-07-04 is Sunday)
    date(2027, 9, 6),
    date(2027, 11, 25),
    date(2027, 12, 24),  # Christmas observed (2027-12-25 is Saturday)
})


def _now_et(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(tz=ET)
    return now.astimezone(ET) if now.tzinfo else now.replace(tzinfo=ET)


def is_us_rth(now: datetime | None = None) -> bool:
    et = _now_et(now)
    if et.weekday() >= 5:
        return False
    if et.date() in _HOLIDAYS:
        return False
    return RTH_OPEN <= et.time() < RTH_CLOSE


def next_open(now: datetime | None = None) -> datetime:
    """Datetime of the next 09:30 ET trading session.

    If `now` is on a trading day before 09:30, returns today's 09:30.
    Otherwise advances day-by-day skipping weekends and holidays.
    """
    et = _now_et(now)
    today = et.date()
    if et.time() < RTH_OPEN and today.weekday() < 5 and today not in _HOLIDAYS:
        return datetime.combine(today, RTH_OPEN, tzinfo=ET)
    candidate = today + timedelta(days=1)
    while candidate.weekday() >= 5 or candidate in _HOLIDAYS:
        candidate += timedelta(days=1)
    return datetime.combine(candidate, RTH_OPEN, tzinfo=ET)

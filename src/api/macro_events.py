"""Static US macro-release calendar (FOMC, CPI, NFP, PPI).

Source: hand-maintained `data/macro-events.json` covering the 2026
calendar. Schedules are public and predictable — FOMC announces 8
meetings a year, BLS publishes CPI/PPI/NFP release dates a year ahead.
A single yearly refresh of the JSON keeps it current. Static beats a
feed integration for one-user reliability.

If the JSON drifts ahead of the calendar, the foresight section just
shows nothing for that period — silent failure mode.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

log = logging.getLogger(__name__)

_PATH = Path(__file__).resolve().parents[2] / "data" / "macro-events.json"


@dataclass(frozen=True)
class MacroEvent:
    date: str         # ISO
    kind: str         # FOMC | CPI | NFP | PPI
    label: str
    description: str


_CACHE: list[MacroEvent] | None = None


def _load() -> list[MacroEvent]:
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    try:
        raw = json.loads(_PATH.read_text())
    except FileNotFoundError:
        log.warning("macro-events.json not found at %s", _PATH)
        _CACHE = []
        return _CACHE
    except Exception as exc:
        log.warning("macro-events.json parse failed: %s", exc)
        _CACHE = []
        return _CACHE
    _CACHE = sorted(
        (
            MacroEvent(
                date=row["date"],
                kind=row["kind"],
                label=row["label"],
                description=row["description"],
            )
            for row in raw
        ),
        key=lambda e: e.date,
    )
    return _CACHE


def get_within(days: int) -> list[MacroEvent]:
    today = date.today()
    horizon = today + timedelta(days=days)
    return [
        e for e in _load()
        if today.isoformat() <= e.date <= horizon.isoformat()
    ]

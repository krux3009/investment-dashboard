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
import re
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

log = logging.getLogger(__name__)

_PATH = Path(__file__).resolve().parents[2] / "data" / "macro-events.json"

# Month name → number, to localise the reference month embedded in the
# English label ("April CPI release" → 4). The reference month differs from
# the release date's month (April data ships in May), so we read it from the
# label text rather than the ISO date.
_MONTH_NUM = {
    m: i + 1
    for i, m in enumerate(
        [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ]
    )
}

# Per-kind Chinese templates. {n} = reference month number. FOMC carries no
# month. Unknown kinds fall back to the English label/description.
_KIND_LABEL_ZH = {
    "CPI": "{n} 月 CPI 数据",
    "PPI": "{n} 月 PPI 数据",
    "NFP": "{n} 月非农数据",
    "FOMC": "FOMC 会议",
}
_KIND_DESC_ZH = {
    "CPI": "美国劳工统计局 {n} 月通胀数据。",
    "PPI": "美国 {n} 月生产者价格指数，上游通胀指标。",
    "NFP": "美国 {n} 月非农就业与失业率。",
    "FOMC": "美联储利率决议、经济预测摘要与鲍威尔记者会。",
}


def _ref_month(label: str) -> int | None:
    """Pull the reference month number out of an English macro label."""
    m = re.match(r"\s*([A-Z][a-z]+)", label)
    return _MONTH_NUM.get(m.group(1)) if m else None


def _zh_label_desc(kind: str, label: str) -> tuple[str, str]:
    """Build (label_zh, description_zh); fall back to English when a kind or
    month can't be resolved so the feed never shows a blank cell."""
    lt = _KIND_LABEL_ZH.get(kind)
    dt = _KIND_DESC_ZH.get(kind)
    if lt is None or dt is None:
        return label, label
    n = _ref_month(label)
    if "{n}" in lt and n is None:
        return label, label
    return lt.format(n=n), dt.format(n=n)


@dataclass(frozen=True)
class MacroEvent:
    date: str         # ISO
    kind: str         # FOMC | CPI | NFP | PPI
    label: str
    description: str
    label_zh: str
    description_zh: str

    def localized(self, locale: str) -> tuple[str, str]:
        if locale == "zh":
            return self.label_zh, self.description_zh
        return self.label, self.description


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
    def _build(row: dict) -> MacroEvent:
        label, description = row["label"], row["description"]
        # Prefer explicit zh fields if the JSON ever carries them; otherwise
        # template from kind + reference month.
        label_zh = row.get("label_zh")
        description_zh = row.get("description_zh")
        if not label_zh or not description_zh:
            t_label, t_desc = _zh_label_desc(row["kind"], label)
            label_zh = label_zh or t_label
            description_zh = description_zh or t_desc
        return MacroEvent(
            date=row["date"],
            kind=row["kind"],
            label=label,
            description=description,
            label_zh=label_zh,
            description_zh=description_zh,
        )

    _CACHE = sorted((_build(row) for row in raw), key=lambda e: e.date)
    return _CACHE


def get_within(days: int) -> list[MacroEvent]:
    today = date.today()
    horizon = today + timedelta(days=days)
    return get_between(today, horizon)


def get_between(start: date, end: date) -> list[MacroEvent]:
    start_str = start.isoformat()
    end_str = end.isoformat()
    return [e for e in _load() if start_str <= e.date <= end_str]

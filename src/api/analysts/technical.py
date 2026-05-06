"""Technical analyst tile.

Context = technical anomalies (KDJ / MA / BOLL / RSI / MACD prose from
moomoo) + 30-day price-move %. "Breakout / breakdown / support /
resistance" used as predictive language are forbidden — the base bans
list catches them. Descriptive past use is allowed (e.g. "tested the
50-day moving average yesterday").
"""

from __future__ import annotations

from api.analysts._base import AnalystOutput, call_analyst
from api.data import anomalies, prices

ROLE = "Technical"
ROLE_BANS: tuple[str, ...] = ()


def _build_context(code: str, ticker: str) -> dict:
    technical_lines = [
        a.content.strip()
        for a in anomalies.fetch_all_plain(code)
        if a.kind == "technical" and a.has_content
    ]
    closes = prices.get_close_series(code, days=30)
    delta_30d_pct: float | None = None
    if len(closes) >= 2 and closes[0]:
        delta_30d_pct = round(((closes[-1] - closes[0]) / closes[0]) * 100, 2)
    return {
        "ticker": ticker,
        "technical_signals": technical_lines or None,
        "thirty_day_change_pct": delta_30d_pct,
    }


def get_take(code: str, ticker: str, name: str) -> AnalystOutput:
    context = _build_context(code, ticker)
    is_empty = (
        not context["technical_signals"]
        and context["thirty_day_change_pct"] in (None, 0, 0.0)
    )
    return call_analyst(
        role=ROLE,
        ticker=ticker,
        name=name,
        context=context,
        role_specific_bans=ROLE_BANS,
        is_context_empty=is_empty,
    )

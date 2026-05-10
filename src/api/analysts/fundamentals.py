"""Fundamentals analyst tile.

Context = capital-flow anomalies + nearest forward earnings + currency.
The dashboard's "fundamentals" surface is necessarily lightweight — moomoo
gives institutional flow as plain English; yfinance gives the next earnings
date. Valuation jargon is forbidden ("cheap", "expensive", "undervalued",
"overvalued", "fairly valued").
"""

from __future__ import annotations

from datetime import date

from api.analysts._base import AnalystOutput, call_analyst
from api.data import anomalies
from api.i18n import Locale

ROLE = "Fundamentals"
ROLE_BANS: dict[Locale, tuple[str, ...]] = {
    "en": ("cheap", "expensive", "undervalued", "overvalued", "fairly valued"),
    "zh": ("便宜", "昂贵", "低估", "高估", "估值合理"),
}


def _build_context(code: str, ticker: str, currency: str) -> dict:
    capital_lines = [
        a.content.strip()
        for a in anomalies.fetch_all_plain(code)
        if a.kind == "capital" and a.has_content
    ]
    earnings_str = "none on calendar"
    try:
        from api import earnings as earnings_module

        for e in earnings_module.get_all():
            if e.code == code:
                earnings_str = f"{e.date} (in {e.days_until} days)"
                break
    except Exception:
        pass

    return {
        "ticker": ticker,
        "currency": currency,
        "capital_flow_signals": capital_lines or None,
        "next_earnings": earnings_str,
    }


def get_take(
    code: str,
    ticker: str,
    name: str,
    currency: str,
    locale: Locale = "en",
) -> AnalystOutput:
    context = _build_context(code, ticker, currency)
    is_empty = not context["capital_flow_signals"] and context["next_earnings"] == "none on calendar"
    return call_analyst(
        role=ROLE,
        ticker=ticker,
        name=name,
        context=context,
        role_specific_bans=ROLE_BANS,
        is_context_empty=is_empty,
        locale=locale,
    )

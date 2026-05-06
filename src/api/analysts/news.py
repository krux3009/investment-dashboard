"""News analyst tile.

Context = top-3 yfinance headlines + macro events landing within 7 days
(FOMC / CPI / NFP / PPI hit every holding). Hype words are forbidden
("breaking", "shocking", "surprising", "unexpected", "bombshell").
"""

from __future__ import annotations

from api.analysts._base import AnalystOutput, call_analyst
from api import macro_events

ROLE = "News"
ROLE_BANS: tuple[str, ...] = (
    "breaking", "shocking", "surprising", "unexpected", "bombshell",
)


def _fetch_news_lazy(code: str) -> list[dict]:
    """Defer the digest._fetch_news import to avoid circular imports
    (digest.py orchestrates the analysts, analysts read its helper).
    """
    from api.digest import _fetch_news

    return _fetch_news(code)


def _build_context(code: str, ticker: str) -> dict:
    headlines = [
        {"title": n["title"], "publisher": n.get("publisher") or ""}
        for n in _fetch_news_lazy(code)
    ]
    macro = [
        {"date": e.date, "kind": e.kind, "label": e.label}
        for e in macro_events.get_within(7)
    ]
    return {
        "ticker": ticker,
        "headlines": headlines or None,
        "macro_releases_within_7d": macro or None,
    }


def get_take(code: str, ticker: str, name: str) -> AnalystOutput:
    context = _build_context(code, ticker)
    is_empty = not context["headlines"] and not context["macro_releases_within_7d"]
    return call_analyst(
        role=ROLE,
        ticker=ticker,
        name=name,
        context=context,
        role_specific_bans=ROLE_BANS,
        is_context_empty=is_empty,
    )

"""Anomaly fetchers wrapping moomoo's three OpenQuoteContext.get_*_unusual
methods.

Each call returns a `data['content']` field — rendered English prose like
"May 1 CCI has moved from neutral to overbought levels…" — that we surface
verbatim in the holdings drill-in. Categories with no anomaly return an
empty Anomaly; the view skips them per the brief's "absence is the signal".

Bypasses the ~/.claude/skills/moomoo-*-anomaly/ subprocess wrappers because
their underlying call is just one SDK method each — direct call is ~1s vs
~5-15s for `claude -p`. Cache is per-session, keyed by (code, kind, range,
lang) so a row expanded twice in one session doesn't refetch.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Literal

log = logging.getLogger(__name__)

AnomalyKind = Literal["technical", "capital", "derivatives"]

_KIND_ORDER: tuple[AnomalyKind, ...] = ("technical", "capital", "derivatives")

_METHOD_FOR_KIND: dict[AnomalyKind, str] = {
    "technical": "get_technical_unusual",
    "capital": "get_financial_unusual",
    "derivatives": "get_derivative_unusual",
}

_LABEL_FOR_KIND: dict[AnomalyKind, str] = {
    "technical": "Technical",
    "capital": "Capital flow",
    "derivatives": "Derivatives",
}


@dataclass(frozen=True)
class Anomaly:
    kind: AnomalyKind
    content: str  # English prose; empty string when no anomaly fires

    @property
    def label(self) -> str:
        return _LABEL_FOR_KIND[self.kind]

    @property
    def has_content(self) -> bool:
        return bool(self.content.strip())


_CACHE: dict[tuple[str, AnomalyKind, int, int], Anomaly] = {}
_QUOTE_CTX: Any = None


def _quote_ctx():
    """Lazy module-level OpenQuoteContext. One connection shared across all
    anomaly fetches for the session. Closed automatically when the process
    exits (Dash dev mode kills python on reload, which is fine).
    """
    global _QUOTE_CTX
    if _QUOTE_CTX is None:
        from moomoo import OpenQuoteContext

        _QUOTE_CTX = OpenQuoteContext(
            host=os.environ.get("MOOMOO_HOST", "127.0.0.1"),
            port=int(os.environ.get("MOOMOO_PORT", "11111")),
        )
    return _QUOTE_CTX


def _fetch_one(code: str, kind: AnomalyKind, time_range: int, language_id: int) -> Anomaly:
    method_name = _METHOD_FOR_KIND[kind]
    try:
        method = getattr(_quote_ctx(), method_name)
        ret, data = method(code, time_range=time_range, language_id=language_id)
    except Exception as exc:
        log.warning("anomaly %s/%s exception: %s", code, kind, exc)
        return Anomaly(kind=kind, content="")

    if ret != 0 or not isinstance(data, dict):
        return Anomaly(kind=kind, content="")

    if data.get("err_code", 1) != 0:
        return Anomaly(kind=kind, content="")

    return Anomaly(kind=kind, content=str(data.get("content", "")).strip())


def fetch_all(
    code: str,
    time_range: int = 7,
    language_id: int = 2,
) -> tuple[Anomaly, ...]:
    """Fetch all three anomaly categories for a ticker. Cached per session.

    Returns a tuple in display order: technical, capital, derivatives.
    Anomalies with empty content should be skipped by the renderer so
    absence stays the signal.
    """
    out: list[Anomaly] = []
    for kind in _KIND_ORDER:
        key = (code, kind, time_range, language_id)
        cached = _CACHE.get(key)
        if cached is not None:
            out.append(cached)
            continue
        anom = _fetch_one(code, kind, time_range, language_id)
        _CACHE[key] = anom
        out.append(anom)
    return tuple(out)

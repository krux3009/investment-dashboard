"""Anomaly fetchers wrapping moomoo's OpenQuoteContext.get_*_unusual methods.

Two categories are surfaced: technical (K-line + indicator events) and
capital flow (broker activity, fund flows, short interest). Derivatives
was trimmed 2026-05-02 — long-horizon equity holding, no options use case.

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

AnomalyKind = Literal["technical", "capital"]

_KIND_ORDER: tuple[AnomalyKind, ...] = ("technical", "capital")

_METHOD_FOR_KIND: dict[AnomalyKind, str] = {
    "technical": "get_technical_unusual",
    "capital": "get_financial_unusual",
}

_LABEL_FOR_KIND: dict[AnomalyKind, str] = {
    "technical": "Technical",
    "capital": "Capital flow",
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
    time_range: int = 30,
    language_id: int = 2,
) -> tuple[Anomaly, ...]:
    """Fetch both anomaly categories for a ticker. Cached per session.

    Returns a tuple in display order: technical, capital. Anomalies with
    empty content should be skipped by the renderer so absence stays the
    signal.
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


def fetch_all_plain(
    code: str,
    time_range: int = 30,
    language_id: int | None = None,
    locale: str = "en",
) -> tuple[Anomaly, ...]:
    """Same as fetch_all but rewrites moomoo's technical prose into the
    reader's locale via the anomaly translator. Empty-content anomalies
    pass through untouched so absence-as-signal still works.

    moomoo's language_id values: 0=简中 (Simplified Chinese),
    1=繁中 (Traditional), 2=English, 4=Thai, 5=Japanese.

    For `locale="zh"`, language_id defaults to 0 (Simplified Chinese):
    moomoo returns native Simplified prose and the translator passes
    it through verbatim (no Claude call). For `locale="en"`,
    language_id defaults to 2 (English) and the translator may rewrite
    for clarity. Explicit `language_id` overrides the locale default.
    """
    from api import anomaly_translator

    if language_id is None:
        language_id = 0 if locale == "zh" else 2

    raw = fetch_all(code, time_range=time_range, language_id=language_id)
    out: list[Anomaly] = []
    for anom in raw:
        if not anom.has_content:
            out.append(anom)
            continue
        plain = anomaly_translator.translate(anom.content, anom.kind, locale=locale)  # type: ignore[arg-type]
        out.append(Anomaly(kind=anom.kind, content=plain))
    return tuple(out)

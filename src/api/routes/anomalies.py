"""GET /api/anomalies/{code}: technical + capital-flow anomaly content,
rewritten in plain English so a beginner can read it.

Wraps api.data.anomalies.fetch_all_plain. The response includes BOTH
kinds (technical + capital-flow), even when one returned no content,
so the drill-in can surface a "no capital-flow anomalies in the last
N days" caption rather than silently hiding the category. Empty-
content items have `content: ""` and the renderer treats them as
absence captions.
"""

from __future__ import annotations

from fastapi import APIRouter

from api.data.anomalies import fetch_all_plain

router = APIRouter()

_DEFAULT_TIME_RANGE = 30


@router.get("/anomalies/{code:path}")
def anomalies(code: str) -> dict:
    """Return both anomaly kinds for a symbol, in plain English."""
    items = [
        {"kind": a.kind, "label": a.label, "content": a.content}
        for a in fetch_all_plain(code, time_range=_DEFAULT_TIME_RANGE)
    ]
    return {"code": code, "items": items, "time_range": _DEFAULT_TIME_RANGE}

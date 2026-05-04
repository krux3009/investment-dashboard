"""GET /api/anomalies/{code} — technical + capital-flow anomaly content,
rewritten in plain English so a beginner can read it.

Wraps api.data.anomalies.fetch_all_plain. Anomalies with empty content
are dropped here so the frontend's drill-in only renders present
categories (matches v2's "absence is the signal" rule). The translator
falls back to moomoo's original prose if Claude can't be reached.
"""

from __future__ import annotations

from fastapi import APIRouter

from api.data.anomalies import fetch_all_plain

router = APIRouter()


@router.get("/anomalies/{code:path}")
def anomalies(code: str) -> dict:
    """Return non-empty anomaly entries for a symbol, in plain English."""
    items = [
        {"kind": a.kind, "label": a.label, "content": a.content}
        for a in fetch_all_plain(code)
        if a.has_content
    ]
    return {"code": code, "items": items}

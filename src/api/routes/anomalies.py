"""GET /api/anomalies/{code} — technical + capital-flow anomaly content.

Wraps dashboard.data.anomalies.fetch_all verbatim. Anomalies with empty
content are dropped here so the frontend's drill-in only renders
present categories (matches v2's "absence is the signal" rule).
"""

from __future__ import annotations

from fastapi import APIRouter

from dashboard.data.anomalies import fetch_all

router = APIRouter()


@router.get("/anomalies/{code:path}")
def anomalies(code: str) -> dict:
    """Return non-empty anomaly entries for a symbol."""
    items = [
        {"kind": a.kind, "label": a.label, "content": a.content}
        for a in fetch_all(code)
        if a.has_content
    ]
    return {"code": code, "items": items}

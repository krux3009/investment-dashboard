"""GET /api/preview — futures + Asia close snapshot for the next US open.

Always returns 200 with whatever rows yfinance gave us. `in_window`
tells the frontend whether SGT pre-market relevance applies; outside
that window the block dims but still renders.
"""

from __future__ import annotations

from fastapi import APIRouter

from api import preview as preview_module

router = APIRouter()


@router.get("/preview")
def get_preview() -> dict:
    return preview_module.to_dict(preview_module.get_preview())

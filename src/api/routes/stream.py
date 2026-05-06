"""GET /api/stream/prices — Server-Sent-Events live tick stream.

Open one EventSource per browser tab. Server holds the connection
open, broadcaster pushes JSON `tick` events at 20s during US RTH,
SSE keepalive comments every 15s, and `market_status` events on
RTH transitions. See api.realtime for cadence + payload shape.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from api.realtime import broadcaster

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/stream/prices")
async def stream_prices(request: Request) -> StreamingResponse:
    sub = broadcaster.subscribe()

    async def event_source():
        try:
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    return
                try:
                    msg = await asyncio.wait_for(sub.queue.get(), timeout=30)
                except asyncio.TimeoutError:
                    yield ": idle\n\n"
                    continue
                yield msg
        finally:
            broadcaster.unsubscribe(sub)

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_source(), media_type="text/event-stream", headers=headers)

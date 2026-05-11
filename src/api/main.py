"""FastAPI app + uvicorn launcher.

Phase A: one route mounted (`/api/holdings`). CORS open to localhost:3000
so the Next.js dev server can fetch.

Run with `uv run api`. Listens on 127.0.0.1:8000.
"""

# Load .env before any module reads MOOMOO_* / Dash-style env vars. Mirrors
# dashboard/app.py:main(). Must happen at import time so uvicorn's reloader
# (which re-imports `api.main:app` in a child process) sees the same vars.
from dotenv import load_dotenv

load_dotenv()

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# uvicorn's default config leaves the root logger at WARNING, which
# silences `log.info` from `api.*` modules (warm-cache progress,
# realtime broadcaster lifecycle, etc.). Configure root → INFO so
# those messages surface alongside uvicorn's own access logs.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s: %(message)s",
)

from api import digest as digest_module
from api.realtime import broadcaster
from api.routes import (
    anomalies,
    benchmark,
    benchmark_insight,
    concentration,
    concentration_insight,
    digest,
    dividends,
    dividends_insight,
    earnings,
    foresight,
    foresight_insight,
    holdings,
    insight,
    notes,
    prices,
    quotes,
    reddit,
    sentiment_insight,
    stream,
    watchlist,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await broadcaster.start()
    # Fire-and-forget digest cache warm: hides the cold-start ~50s
    # cost of 5×4 Claude calls behind startup. yield happens whether
    # or not warm completes — Claude availability must not block boot.
    warm_task = asyncio.create_task(digest_module.warm_cache())
    try:
        yield
    finally:
        if not warm_task.done():
            warm_task.cancel()
            try:
                await warm_task
            except asyncio.CancelledError:
                pass
        await broadcaster.stop()


app = FastAPI(title="investment-dashboard API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "PUT", "DELETE"],
    allow_headers=["*"],
)

app.include_router(holdings.router, prefix="/api")
app.include_router(prices.router, prefix="/api")
app.include_router(quotes.router, prefix="/api")
app.include_router(anomalies.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(digest.router, prefix="/api")
app.include_router(insight.router, prefix="/api")
app.include_router(earnings.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(benchmark.router, prefix="/api")
app.include_router(benchmark_insight.router, prefix="/api")
app.include_router(concentration.router, prefix="/api")
app.include_router(concentration_insight.router, prefix="/api")
app.include_router(foresight.router, prefix="/api")
app.include_router(foresight_insight.router, prefix="/api")
app.include_router(stream.router, prefix="/api")
app.include_router(reddit.router, prefix="/api")
app.include_router(sentiment_insight.router, prefix="/api")
app.include_router(dividends.router, prefix="/api")
app.include_router(dividends_insight.router, prefix="/api")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def cli() -> None:
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=["src"],
    )

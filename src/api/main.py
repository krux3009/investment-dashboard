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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import (
    anomalies,
    benchmark,
    benchmark_insight,
    digest,
    earnings,
    earnings_insight,
    holdings,
    insight,
    notes,
    prices,
    preview,
    preview_insight,
    watchlist,
)

app = FastAPI(title="investment-dashboard API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "PUT", "DELETE"],
    allow_headers=["*"],
)

app.include_router(holdings.router, prefix="/api")
app.include_router(prices.router, prefix="/api")
app.include_router(anomalies.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(digest.router, prefix="/api")
app.include_router(insight.router, prefix="/api")
app.include_router(earnings.router, prefix="/api")
app.include_router(earnings_insight.router, prefix="/api")
app.include_router(preview.router, prefix="/api")
app.include_router(preview_insight.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(benchmark.router, prefix="/api")
app.include_router(benchmark_insight.router, prefix="/api")


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

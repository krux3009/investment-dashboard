"""GET /api/benchmark-insight — advisor commentary on the comparison."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import benchmark, benchmark_insight

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/benchmark-insight")
def get_benchmark_insight(
    days: int = Query(90, ge=7, le=730),
    symbols: str | None = Query(None),
    refresh: bool = Query(False),
) -> dict:
    syms = benchmark.parse_symbols(symbols)
    try:
        ins = benchmark_insight.get_insight(days=days, symbols=syms, force_refresh=refresh)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("benchmark insight failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if ins is None:
        raise HTTPException(status_code=404, detail="no portfolio data for the window")
    return {
        "days": ins.days,
        "symbols": ins.symbols,
        "what": ins.what,
        "meaning": ins.meaning,
        "watch": ins.watch,
        "generated_at": ins.generated_at.isoformat(),
        "cached": ins.cached,
    }

"""GET /api/benchmark — portfolio + benchmark series for the chart."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from api import benchmark
from api.models import BenchmarkResponse, BenchmarkSeries, SeriesPoint

router = APIRouter()


@router.get("/benchmark", response_model=BenchmarkResponse)
def get_benchmark(days: int = Query(90, ge=7, le=730), symbols: str | None = Query(None)) -> BenchmarkResponse:
    syms = benchmark.parse_symbols(symbols)

    bench_series: dict[str, list[SeriesPoint]] = {}
    for sym in syms:
        rows = benchmark.get_series(sym, days)
        bench_series[sym] = [
            SeriesPoint(trade_date=r.trade_date, pct=r.pct) for r in rows
        ]

    primary_calendar = [p.trade_date for p in (next(iter(bench_series.values()), []) or [])]
    portfolio = [
        SeriesPoint(trade_date=p.trade_date, pct=p.pct)
        for p in benchmark.compute_portfolio_series(days=days, calendar=primary_calendar)
    ]

    return BenchmarkResponse(
        days=days,
        symbols=syms,
        as_of=date.today().isoformat(),
        portfolio=portfolio,
        benchmarks=[
            BenchmarkSeries(symbol=sym, points=points)
            for sym, points in bench_series.items()
        ],
        weighting_caveat="Path uses current weights projected backward.",
    )

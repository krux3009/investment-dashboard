"""Pydantic response models.

Mirror dashboard.data.positions.Position field-for-field, plus the
USD-converted aggregates the v3 hero needs (single home currency).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


Market = Literal["US", "HK", "CN", "JP", "SG", "AU", "MY", "CA", "?"]
Currency = Literal["USD", "HKD", "CNH", "JPY", "SGD", "AUD", "MYR", "CAD", "?"]


class Holding(BaseModel):
    code: str
    ticker: str
    name: str
    market: Market
    currency: Currency

    qty: float
    cost_basis: float
    current_price: float
    market_value: float           # native currency
    market_value_usd: float       # FX-converted

    today_change_pct: float | None
    today_change_abs: float | None

    total_pnl_pct: float
    total_pnl_abs: float          # native currency
    total_pnl_abs_usd: float      # FX-converted


class HoldingsResponse(BaseModel):
    holdings: list[Holding]
    total_market_value_usd: float
    total_pnl_abs_usd: float
    total_pnl_pct: float                # weighted-avg in USD terms
    currencies: dict[str, float]        # ccy → native subtotal (for hero tooltip)
    fx_rates_used: dict[str, float]     # e.g. {"USDSGD": 1.319}
    last_updated: str                   # ISO 8601
    fresh: bool
    simulate_with_no_positions: bool


class Note(BaseModel):
    code: str
    body: str
    updated_at: str                     # ISO 8601


class SeriesPoint(BaseModel):
    trade_date: str                     # ISO date
    pct: float                          # cumulative %Δ from window start


class BenchmarkSeries(BaseModel):
    symbol: str
    points: list[SeriesPoint]


class BenchmarkResponse(BaseModel):
    days: int
    symbols: list[str]
    as_of: str                          # ISO date
    portfolio: list[SeriesPoint]
    benchmarks: list[BenchmarkSeries]
    weighting_caveat: str


class TopName(BaseModel):
    code: str
    ticker: str
    pct: float


class ConcentrationResponse(BaseModel):
    count: int
    total_market_value_usd: float
    top1_pct: float
    top3_pct: float
    top5_pct: float
    top_names: list[TopName]
    currency_exposure: dict[str, float]
    single_name_max: TopName | None


ForesightKind = Literal["earnings", "macro", "company_event"]


class ForesightEvent(BaseModel):
    event_id: str
    date: str               # ISO
    days_until: int
    kind: ForesightKind
    code: str | None
    ticker: str | None
    label: str
    description: str


class ForesightResponse(BaseModel):
    days: int
    as_of: str              # ISO
    holdings_covered: list[str]
    events: list[ForesightEvent]

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

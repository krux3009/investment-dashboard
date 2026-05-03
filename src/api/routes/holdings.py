"""GET /api/holdings — live positions, USD-aggregated.

Reuses dashboard.data.moomoo_client.get_summary() verbatim (respects
MOOMOO_USE_DEMO + MOOMOO_TRD_ENV from .env). Each position's native
market value gets FX-converted to USD via api.fx.
"""

from __future__ import annotations

from fastapi import APIRouter

from api import fx
from api.models import Holding, HoldingsResponse
from api.data.moomoo_client import get_summary

router = APIRouter()


@router.get("/holdings", response_model=HoldingsResponse)
def list_holdings() -> HoldingsResponse:
    summary = get_summary()

    holdings: list[Holding] = []
    total_mv_usd = 0.0
    total_pnl_usd = 0.0
    currencies_native: dict[str, float] = {}

    for p in summary.positions:
        mv_usd, _ = fx.convert(p.market_value, p.currency, "USD")
        pnl_usd, _ = fx.convert(p.total_pnl_abs, p.currency, "USD")

        holdings.append(
            Holding(
                code=p.code,
                ticker=p.ticker,
                name=p.name,
                market=p.market,
                currency=p.currency,
                qty=p.qty,
                cost_basis=p.cost_basis,
                current_price=p.current_price,
                market_value=p.market_value,
                market_value_usd=mv_usd,
                today_change_pct=p.today_change_pct,
                today_change_abs=p.today_change_abs,
                total_pnl_pct=p.total_pnl_pct,
                total_pnl_abs=p.total_pnl_abs,
                total_pnl_abs_usd=pnl_usd,
            )
        )
        total_mv_usd += mv_usd
        total_pnl_usd += pnl_usd
        currencies_native[p.currency] = currencies_native.get(p.currency, 0.0) + p.market_value

    cost_usd = total_mv_usd - total_pnl_usd
    total_pnl_pct = (total_pnl_usd / cost_usd) if cost_usd > 0 else 0.0

    return HoldingsResponse(
        holdings=holdings,
        total_market_value_usd=total_mv_usd,
        total_pnl_abs_usd=total_pnl_usd,
        total_pnl_pct=total_pnl_pct,
        currencies=currencies_native,
        fx_rates_used=fx.rates_used_snapshot(),
        last_updated=summary.last_updated.isoformat(),
        fresh=summary.fresh,
        simulate_with_no_positions=summary.simulate_with_no_positions,
    )

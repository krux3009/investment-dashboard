"""Forward forecast + quality buckets for `/portfolio` Dividends tab.

Layers on top of `api.dividends`. Two routes:

  /api/dividends/forecast?horizon=12m|24m|36m
    Forward dividend forecast per holding. Naive projection: scale TTM
    income by horizon ratio (12m → ×1, 24m → ×2, 36m → ×3). No growth
    model — yfinance doesn't expose dividend forecasts, and we want
    the observation to stay honest. `growth_pct` compares TTM vs the
    prior 12-month window (when ≥2 years of history exist).

  /api/dividends/quality-buckets
    Buckets each holding by its `snowflake.dividends` score:
      0-2 → low, 3-4 → medium, 5-6 → high.
    Returns {low/medium/high: {total_usd, pct, count}}.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from api import dividends, snowflake
from api.data.moomoo_client import get_summary
from api.holdings_payload import build_holdings_response

_HORIZON_FACTORS: dict[str, float] = {"12m": 1.0, "24m": 2.0, "36m": 3.0}


@dataclass(frozen=True)
class ForecastHolding:
    code: str
    ticker: str
    name: str
    payment_12m_usd: float
    yield_pct: float | None
    yield_on_cost_pct: float | None
    score: int | None
    growth_pct: float | None


def _previous_ttm(history_dates_amounts: list[tuple[date, float]], today: date) -> float:
    """Sum of per-share amounts in the [today-730d, today-365d) window."""
    from datetime import timedelta
    older_start = today - timedelta(days=730)
    older_end = today - timedelta(days=365)
    return sum(amt for d, amt in history_dates_amounts if older_start <= d < older_end)


def get_forecast(horizon: str = "12m") -> dict:
    factor = _HORIZON_FACTORS.get(horizon, 1.0)
    summary = get_summary()
    response = build_holdings_response(summary)
    response_divs = dividends.get_portfolio()
    div_by_code = {item.code: item for item in response_divs.items}
    pos_by_code = {p.code: p for p in summary.positions}

    today = date.today()
    holdings: list[ForecastHolding] = []
    total_usd = 0.0

    for h in response.holdings:
        item = div_by_code.get(h.code)
        pos = pos_by_code.get(h.code)
        if item is None or pos is None:
            continue
        payment_usd = item.ttm_total_usd * factor
        total_usd += payment_usd

        yield_pct: float | None
        if item.ttm_per_share_native > 0 and pos.current_price > 0:
            yield_pct = item.ttm_per_share_native / pos.current_price * 100.0
        else:
            yield_pct = None

        yield_on_cost_pct: float | None
        if item.ttm_per_share_native > 0 and pos.cost_basis > 0:
            yield_on_cost_pct = item.ttm_per_share_native / pos.cost_basis * 100.0
        else:
            yield_on_cost_pct = None

        # growth_pct from raw cache history (skip building a full DividendsResponse)
        from api.dividends import _read_history  # noqa: PLC0415
        raw = _read_history(h.code)
        prior_per_share = _previous_ttm(
            [(d, amt) for d, amt, _ in raw], today
        )
        growth_pct: float | None
        if prior_per_share > 0:
            growth_pct = (item.ttm_per_share_native - prior_per_share) / prior_per_share * 100.0
        else:
            growth_pct = None

        snow = snowflake.get_for_code(h.code)
        score = snow.scores.dividends if snow else None

        holdings.append(ForecastHolding(
            code=h.code, ticker=h.ticker, name=h.name,
            payment_12m_usd=payment_usd,
            yield_pct=yield_pct,
            yield_on_cost_pct=yield_on_cost_pct,
            score=score,
            growth_pct=growth_pct,
        ))

    monthly_avg = total_usd / (12.0 * factor) if factor > 0 else 0.0

    return {
        "horizon": horizon,
        "total_usd": total_usd,
        "monthly_avg_usd": monthly_avg,
        "as_of": today.isoformat(),
        "holdings": [
            {
                "code": h.code, "ticker": h.ticker, "name": h.name,
                "payment_12m_usd": h.payment_12m_usd,
                "yield_pct": h.yield_pct,
                "yield_on_cost_pct": h.yield_on_cost_pct,
                "score": h.score,
                "growth_pct": h.growth_pct,
            }
            for h in holdings
        ],
    }


def get_quality_buckets() -> dict:
    summary = get_summary()
    response = build_holdings_response(summary)
    divs = dividends.get_portfolio()
    div_by_code = {item.code: item.ttm_total_usd for item in divs.items}

    buckets = {
        "low": {"total_usd": 0.0, "count": 0},
        "medium": {"total_usd": 0.0, "count": 0},
        "high": {"total_usd": 0.0, "count": 0},
    }

    for h in response.holdings:
        ttm_usd = div_by_code.get(h.code, 0.0)
        if ttm_usd <= 0:
            continue
        snow = snowflake.get_for_code(h.code)
        score = snow.scores.dividends if snow else None
        if score is None:
            tier = "low"
        elif score <= 2:
            tier = "low"
        elif score <= 4:
            tier = "medium"
        else:
            tier = "high"
        buckets[tier]["total_usd"] += ttm_usd
        buckets[tier]["count"] += 1

    grand_total = sum(b["total_usd"] for b in buckets.values())
    for b in buckets.values():
        b["pct"] = (b["total_usd"] / grand_total * 100.0) if grand_total > 0 else 0.0

    return {"as_of": date.today().isoformat(), "buckets": buckets, "total_usd": grand_total}

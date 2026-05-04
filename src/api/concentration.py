"""Portfolio shape — top-N USD share, currency exposure, single-name max.

Pure computation off the canonical HoldingsResponse. Observational
only: no thresholds, no risk grading, no rebalance suggestions. The
response is a quiet read of the book's current shape; the optional
advisor block (concentration_insight.py) layers a plain-English
sentence on top.
"""

from __future__ import annotations

from dataclasses import dataclass

from api import fx
from api.models import HoldingsResponse
from api.routes.holdings import list_holdings


@dataclass(frozen=True)
class TopName:
    code: str
    ticker: str
    pct: float


@dataclass(frozen=True)
class Concentration:
    count: int
    total_market_value_usd: float
    top1_pct: float
    top3_pct: float
    top5_pct: float
    top_names: list[TopName]
    currency_exposure: dict[str, float]
    single_name_max: TopName | None


def _compute(h: HoldingsResponse) -> Concentration:
    if not h.holdings or h.total_market_value_usd <= 0:
        return Concentration(
            count=len(h.holdings),
            total_market_value_usd=h.total_market_value_usd,
            top1_pct=0.0,
            top3_pct=0.0,
            top5_pct=0.0,
            top_names=[],
            currency_exposure={},
            single_name_max=None,
        )

    total = h.total_market_value_usd
    sorted_holdings = sorted(h.holdings, key=lambda x: x.market_value_usd, reverse=True)

    def share(n: int) -> float:
        return sum(x.market_value_usd for x in sorted_holdings[:n]) / total

    top_names = [
        TopName(code=x.code, ticker=x.ticker, pct=x.market_value_usd / total)
        for x in sorted_holdings[:5]
    ]

    ccy_usd: dict[str, float] = {}
    for x in h.holdings:
        usd, _ = fx.convert(x.market_value, x.currency, "USD")
        ccy_usd[x.currency] = ccy_usd.get(x.currency, 0.0) + usd
    currency_exposure = {k: v / total for k, v in ccy_usd.items()}

    biggest = sorted_holdings[0]
    single_name_max = TopName(
        code=biggest.code,
        ticker=biggest.ticker,
        pct=biggest.market_value_usd / total,
    )

    return Concentration(
        count=len(h.holdings),
        total_market_value_usd=total,
        top1_pct=share(1),
        top3_pct=share(3),
        top5_pct=share(5),
        top_names=top_names,
        currency_exposure=currency_exposure,
        single_name_max=single_name_max,
    )


def get_concentration() -> Concentration:
    return _compute(list_holdings())

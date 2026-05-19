"""Returns breakdown aggregator for `/portfolio` Returns tab.

moomoo OpenD exposes only current positions + average cost — no
transaction history, no realized-P&L. We compute unrealized + TTM
dividends honestly and stub realized + currency-impact with a
`partial: true` flag so the frontend can render a "Connect transactions
for full detail" caption on those tiles.

Pure aggregation — no Claude, no cache. Reads through
`holdings_payload.build_holdings_response()` (already gated by the 5s
moomoo TTL) and `dividends.get_portfolio()` (24h yfinance TTL).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from api import dividends
from api.data.moomoo_client import get_summary
from api.holdings_payload import build_holdings_response


@dataclass(frozen=True)
class ReturnsSummary:
    unrealized_usd: float
    realized_usd: float        # always 0.0 until transaction layer
    dividends_usd: float       # TTM
    currency_impact_usd: float  # always 0.0 until cost-basis-in-USD layer
    total_usd: float
    partial: bool
    missing: tuple[str, ...]
    as_of: str


@dataclass(frozen=True)
class HoldingReturn:
    code: str
    ticker: str
    name: str
    shares: float
    avg_price: float
    current_price: float
    value_usd: float
    cost_basis_usd: float
    unrealized_usd: float
    unrealized_pct: float
    dividends_ttm_usd: float
    total_gain_usd: float
    total_gain_pct: float


@dataclass(frozen=True)
class ReturnsDetail:
    as_of: str
    holdings: tuple[HoldingReturn, ...]


@dataclass(frozen=True)
class Contributor:
    code: str
    ticker: str
    total_gain_usd: float
    total_gain_pct: float


@dataclass(frozen=True)
class Contributors:
    highest: tuple[Contributor, ...]
    lowest: tuple[Contributor, ...]


def _build_detail() -> ReturnsDetail:
    summary = get_summary()
    response = build_holdings_response(summary)
    divs = dividends.get_portfolio()
    div_by_code = {item.code: item.ttm_total_usd for item in divs.items}
    pos_by_code = {p.code: p for p in summary.positions}

    rows: list[HoldingReturn] = []
    for h in response.holdings:
        pos = pos_by_code.get(h.code)
        if pos is None:
            continue
        cost_basis_usd = (h.market_value_usd or 0.0) - (h.total_pnl_abs_usd or 0.0)
        div_usd = div_by_code.get(h.code, 0.0)
        total_gain_usd = (h.total_pnl_abs_usd or 0.0) + div_usd
        total_gain_pct = (total_gain_usd / cost_basis_usd) if cost_basis_usd > 0 else 0.0
        rows.append(
            HoldingReturn(
                code=h.code,
                ticker=h.ticker,
                name=h.name,
                shares=h.qty,
                avg_price=h.cost_basis,
                current_price=h.current_price,
                value_usd=h.market_value_usd or 0.0,
                cost_basis_usd=cost_basis_usd,
                unrealized_usd=h.total_pnl_abs_usd or 0.0,
                unrealized_pct=h.total_pnl_pct or 0.0,
                dividends_ttm_usd=div_usd,
                total_gain_usd=total_gain_usd,
                total_gain_pct=total_gain_pct,
            )
        )

    return ReturnsDetail(as_of=date.today().isoformat(), holdings=tuple(rows))


def get_summary_returns() -> ReturnsSummary:
    detail = _build_detail()
    unrealized = sum(h.unrealized_usd for h in detail.holdings)
    div_ttm = sum(h.dividends_ttm_usd for h in detail.holdings)
    return ReturnsSummary(
        unrealized_usd=unrealized,
        realized_usd=0.0,
        dividends_usd=div_ttm,
        currency_impact_usd=0.0,
        total_usd=unrealized + div_ttm,
        partial=True,
        missing=("realized", "currency"),
        as_of=detail.as_of,
    )


def get_detail() -> ReturnsDetail:
    return _build_detail()


def get_contributors(n: int = 5) -> Contributors:
    detail = _build_detail()
    sorted_rows = sorted(detail.holdings, key=lambda h: h.total_gain_usd, reverse=True)
    top = tuple(
        Contributor(
            code=h.code, ticker=h.ticker,
            total_gain_usd=h.total_gain_usd, total_gain_pct=h.total_gain_pct,
        )
        for h in sorted_rows[:n]
    )
    bottom = tuple(
        Contributor(
            code=h.code, ticker=h.ticker,
            total_gain_usd=h.total_gain_usd, total_gain_pct=h.total_gain_pct,
        )
        for h in sorted_rows[-n:][::-1] if len(sorted_rows) > n
    )
    if not bottom:
        bottom = tuple(
            Contributor(
                code=h.code, ticker=h.ticker,
                total_gain_usd=h.total_gain_usd, total_gain_pct=h.total_gain_pct,
            )
            for h in sorted_rows[::-1]
        )
    return Contributors(highest=top, lowest=bottom)


def summary_to_dict(r: ReturnsSummary) -> dict:
    return {
        "unrealized_usd": r.unrealized_usd,
        "realized_usd": r.realized_usd,
        "dividends_usd": r.dividends_usd,
        "currency_impact_usd": r.currency_impact_usd,
        "total_usd": r.total_usd,
        "partial": r.partial,
        "missing": list(r.missing),
        "as_of": r.as_of,
    }


def detail_to_dict(d: ReturnsDetail) -> dict:
    return {
        "as_of": d.as_of,
        "holdings": [
            {
                "code": h.code,
                "ticker": h.ticker,
                "name": h.name,
                "shares": h.shares,
                "avg_price": h.avg_price,
                "current_price": h.current_price,
                "value_usd": h.value_usd,
                "cost_basis_usd": h.cost_basis_usd,
                "unrealized_usd": h.unrealized_usd,
                "unrealized_pct": h.unrealized_pct,
                "dividends_ttm_usd": h.dividends_ttm_usd,
                "total_gain_usd": h.total_gain_usd,
                "total_gain_pct": h.total_gain_pct,
            }
            for h in d.holdings
        ],
    }


def contributors_to_dict(c: Contributors) -> dict:
    def _row(x: Contributor) -> dict:
        return {
            "code": x.code,
            "ticker": x.ticker,
            "total_gain_usd": x.total_gain_usd,
            "total_gain_pct": x.total_gain_pct,
        }

    return {
        "highest": [_row(x) for x in c.highest],
        "lowest": [_row(x) for x in c.lowest],
    }

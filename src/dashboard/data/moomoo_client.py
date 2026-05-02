"""moomoo OpenD client.

Wraps the moomoo Python SDK behind a single fetch_positions() call. Handles:
- Multi-market queries (US, HK, CN). One trade context per market, opened
  lazily and reused across polls.
- Connection failures: returns last cached PortfolioSummary with fresh=False
  so the holdings view can render stale data with a timestamp.
- Demo mode: when MOOMOO_USE_DEMO=true, returns canned positions for UI
  development without depending on real OpenD state.

OpenD must be running for live mode. trade unlock stays manual in the OpenD
GUI per the install skill's deliberate human-in-the-loop.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

from dashboard.data.positions import (
    Currency,
    Market,
    PortfolioSummary,
    Position,
)

log = logging.getLogger(__name__)

# moomoo's code prefixes map to our Market literal.
_MARKET_FROM_PREFIX: dict[str, Market] = {
    "US": "US", "HK": "HK", "SH": "CN", "SZ": "CN",
    "JP": "JP", "SG": "SG", "AU": "AU", "MY": "MY", "CA": "CA",
}


def _strip_prefix(code: str) -> str:
    """'US.PLTR' → 'PLTR'; '700.HK' → '700'; bare codes pass through."""
    if "." in code:
        prefix, ticker = code.split(".", 1)
        if prefix in _MARKET_FROM_PREFIX or ticker in _MARKET_FROM_PREFIX:
            # moomoo uses 'US.PLTR' (prefix.ticker); some HK quotes are '700.HK'
            return ticker if prefix in _MARKET_FROM_PREFIX else prefix
    return code


def _market_from_code(code: str) -> Market:
    if "." in code:
        prefix = code.split(".", 1)[0]
        return _MARKET_FROM_PREFIX.get(prefix, "?")
    return "?"


# ── Live client ─────────────────────────────────────────────────────────────


class MoomooClient:
    """Live client. Holds one trade context per queried market."""

    def __init__(
        self,
        host: str,
        port: int,
        security_firm: str,
        trd_env: str,
        markets: tuple[str, ...] = ("US", "HK"),
    ) -> None:
        self.host = host
        self.port = port
        self.security_firm = security_firm
        self.trd_env = trd_env
        self.markets = markets
        self._contexts: dict[str, Any] = {}
        self._cache: PortfolioSummary | None = None

    # Late import: moomoo imports are slow (~1s) and we want module import
    # of dashboard.app to stay snappy. Doing it at first fetch is fine.
    def _trade_ctx(self, market: str):
        if market in self._contexts:
            return self._contexts[market]
        from moomoo import OpenSecTradeContext, SecurityFirm, TrdMarket

        market_enum = getattr(TrdMarket, market, TrdMarket.US)
        firm_enum = getattr(SecurityFirm, self.security_firm, SecurityFirm.FUTUSG)
        ctx = OpenSecTradeContext(
            filter_trdmarket=market_enum,
            host=self.host,
            port=self.port,
            security_firm=firm_enum,
        )
        self._contexts[market] = ctx
        return ctx

    def fetch_positions(self) -> PortfolioSummary:
        """Query positions across configured markets. Returns stale cache on failure."""
        from moomoo import TrdEnv

        trd_env = getattr(TrdEnv, self.trd_env, TrdEnv.SIMULATE)
        positions: list[Position] = []
        any_failure = False

        for market in self.markets:
            try:
                ctx = self._trade_ctx(market)
                ret, data = ctx.position_list_query(trd_env=trd_env)
                if ret != 0:
                    log.warning("position_list_query(%s) returned %s: %s", market, ret, data)
                    any_failure = True
                    continue
                if data is None or len(data) == 0:
                    continue
                for _, row in data.iterrows():
                    positions.append(_position_from_row(row))
            except Exception as exc:
                log.warning("Failed to fetch %s positions: %s", market, exc)
                any_failure = True

        # If the whole fetch failed AND we have a cache, return stale.
        if any_failure and not positions and self._cache is not None:
            return PortfolioSummary(
                positions=self._cache.positions,
                total_market_value_by_ccy=self._cache.total_market_value_by_ccy,
                total_pnl_pct=self._cache.total_pnl_pct,
                total_pnl_abs_by_ccy=self._cache.total_pnl_abs_by_ccy,
                last_updated=self._cache.last_updated,
                fresh=False,
            )

        summary = _summarize(positions, fresh=not any_failure)
        self._cache = summary
        return summary

    def close(self) -> None:
        for ctx in self._contexts.values():
            try:
                ctx.close()
            except Exception:
                pass
        self._contexts.clear()


def _position_from_row(row: Any) -> Position:
    """Translate one moomoo SDK DataFrame row into our Position."""
    code = str(row.get("code", ""))
    market = _market_from_code(code)
    currency: Currency = str(row.get("currency", "?")).upper() or "?"  # type: ignore[assignment]

    qty = float(row.get("qty") or 0.0)
    cost_price = float(row.get("cost_price") or 0.0)
    nominal = float(row.get("nominal_price") or 0.0)
    market_val = float(row.get("market_val") or qty * nominal)
    pl_val = float(row.get("pl_val") or 0.0)

    # moomoo's pl_ratio is in PERCENT units (18.3 means 18.3%), we store as ratio.
    pl_ratio_raw = row.get("pl_ratio")
    pl_pct = (float(pl_ratio_raw) / 100.0) if pl_ratio_raw is not None else 0.0

    today_pl = row.get("today_pl_val")
    today_pl_abs = float(today_pl) if today_pl is not None else None
    # Today's % is best derived from yesterday's close, which the position
    # query doesn't include. v1 derives from today_pl_val and the market_val
    # at session open: prev_mv = market_val − today_pl. % = today_pl / prev_mv.
    today_pct: float | None = None
    if today_pl_abs is not None and market_val != 0:
        prev_mv = market_val - today_pl_abs
        if prev_mv > 0:
            today_pct = today_pl_abs / prev_mv

    return Position(
        code=code,
        ticker=_strip_prefix(code),
        name=str(row.get("stock_name", "")),
        market=market,
        currency=currency,
        qty=qty,
        cost_basis=cost_price,
        current_price=nominal,
        market_value=market_val,
        today_change_pct=today_pct,
        today_change_abs=today_pl_abs,
        total_pnl_pct=pl_pct,
        total_pnl_abs=pl_val,
    )


def _summarize(positions: list[Position], fresh: bool = True) -> PortfolioSummary:
    """Aggregate positions into the PortfolioSummary, sorted by weight desc."""
    by_ccy_mv: dict[Currency, float] = {}
    by_ccy_pnl: dict[Currency, float] = {}
    for p in positions:
        by_ccy_mv[p.currency] = by_ccy_mv.get(p.currency, 0.0) + p.market_value
        by_ccy_pnl[p.currency] = by_ccy_pnl.get(p.currency, 0.0) + p.total_pnl_abs

    # Weighted-avg total P&L%, weighted by market value within each currency.
    # When the book is single-currency (the common case) this is exact;
    # for mixed-currency we naively use the combined absolute / combined cost
    # basis without FX conversion. v2 handles FX properly.
    total_mv = sum(by_ccy_mv.values())
    total_pnl_abs = sum(by_ccy_pnl.values())
    total_cost = total_mv - total_pnl_abs
    pnl_pct = (total_pnl_abs / total_cost) if total_cost > 0 else 0.0

    # Sort positions by weight desc within their currency group, then by raw mv.
    sorted_positions = tuple(sorted(positions, key=lambda p: -p.market_value))

    return PortfolioSummary(
        positions=sorted_positions,
        total_market_value_by_ccy=by_ccy_mv,
        total_pnl_pct=pnl_pct,
        total_pnl_abs_by_ccy=by_ccy_pnl,
        last_updated=datetime.now(),
        fresh=fresh,
    )


# ── Demo mode ───────────────────────────────────────────────────────────────


def demo_summary() -> PortfolioSummary:
    """Canned positions for UI development without depending on OpenD state.

    Models the user's known active theses (PLTR / ANET / VRT) plus a couple
    of watchlist additions to test multi-position behavior. Numbers are
    plausible but invented.
    """
    pos = [
        Position(
            code="US.PLTR", ticker="PLTR", name="Palantir Technologies Inc",
            market="US", currency="USD",
            qty=250, cost_basis=19.95, current_price=24.10, market_value=6025.00,
            today_change_pct=0.024, today_change_abs=140.0,
            total_pnl_pct=0.183, total_pnl_abs=932.50,
        ),
        Position(
            code="US.ANET", ticker="ANET", name="Arista Networks Inc",
            market="US", currency="USD",
            qty=14, cost_basis=388.50, current_price=412.30, market_value=5772.20,
            today_change_pct=-0.008, today_change_abs=-46.5,
            total_pnl_pct=0.061, total_pnl_abs=331.20,
        ),
        Position(
            code="US.VRT", ticker="VRT", name="Vertiv Holdings Co",
            market="US", currency="USD",
            qty=45, cost_basis=110.85, current_price=108.50, market_value=4882.50,
            today_change_pct=0.003, today_change_abs=14.0,
            total_pnl_pct=-0.021, total_pnl_abs=-103.50,
        ),
        Position(
            code="US.NVDA", ticker="NVDA", name="NVIDIA Corp",
            market="US", currency="USD",
            qty=8, cost_basis=485.20, current_price=512.40, market_value=4099.20,
            today_change_pct=0.011, today_change_abs=44.0,
            total_pnl_pct=0.056, total_pnl_abs=217.60,
        ),
    ]
    return _summarize(pos, fresh=True)


def demo_summary_empty() -> PortfolioSummary:
    return _summarize([], fresh=True)


def demo_summary_bad_day() -> PortfolioSummary:
    """A synthetic ~-12% market day for visual stress-testing the calm-under-
    volatility principle. Does PRODUCT.md's commitment hold when the book is red?
    Same positions and cost bases as demo_summary, plus a hard down-day.
    """
    pos = [
        Position(
            code="US.PLTR", ticker="PLTR", name="Palantir Technologies Inc",
            market="US", currency="USD",
            qty=250, cost_basis=19.95, current_price=18.40, market_value=4600.00,
            today_change_pct=-0.118, today_change_abs=-615.0,
            total_pnl_pct=-0.078, total_pnl_abs=-387.50,
        ),
        Position(
            code="US.ANET", ticker="ANET", name="Arista Networks Inc",
            market="US", currency="USD",
            qty=14, cost_basis=388.50, current_price=358.20, market_value=5014.80,
            today_change_pct=-0.094, today_change_abs=-520.5,
            total_pnl_pct=-0.078, total_pnl_abs=-424.20,
        ),
        Position(
            code="US.VRT", ticker="VRT", name="Vertiv Holdings Co",
            market="US", currency="USD",
            qty=45, cost_basis=110.85, current_price=92.10, market_value=4144.50,
            today_change_pct=-0.135, today_change_abs=-647.0,
            total_pnl_pct=-0.169, total_pnl_abs=-841.50,
        ),
        Position(
            code="US.NVDA", ticker="NVDA", name="NVIDIA Corp",
            market="US", currency="USD",
            qty=8, cost_basis=485.20, current_price=448.20, market_value=3585.60,
            today_change_pct=-0.082, today_change_abs=-321.0,
            total_pnl_pct=-0.076, total_pnl_abs=-296.00,
        ),
    ]
    return _summarize(pos, fresh=True)


def demo_summary_stale() -> PortfolioSummary:
    summary = demo_summary()
    return PortfolioSummary(
        positions=summary.positions,
        total_market_value_by_ccy=summary.total_market_value_by_ccy,
        total_pnl_pct=summary.total_pnl_pct,
        total_pnl_abs_by_ccy=summary.total_pnl_abs_by_ccy,
        last_updated=datetime(2026, 5, 2, 13, 49),  # ~14 min before the demo's "now"
        fresh=False,
    )


# ── Module-level access ─────────────────────────────────────────────────────

_CLIENT: MoomooClient | None = None


def get_summary() -> PortfolioSummary:
    """The view's single entry point. Reads MOOMOO_USE_DEMO from the env.

    When demo mode is on, MOOMOO_DEMO_SCENARIO selects which canned dataset:
      - "default" (or unset): the everyday +day book
      - "bad_day": a synthetic ~-12% market day, used for stress-testing
        the design's calm-under-volatility commitment
      - "empty": no positions; renders the empty state
    """
    if os.environ.get("MOOMOO_USE_DEMO", "false").lower() == "true":
        scenario = os.environ.get("MOOMOO_DEMO_SCENARIO", "default").lower()
        if scenario == "bad_day":
            return demo_summary_bad_day()
        if scenario == "empty":
            return demo_summary_empty()
        return demo_summary()
    return _live_client().fetch_positions()


def _live_client() -> MoomooClient:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = MoomooClient(
            host=os.environ.get("MOOMOO_HOST", "127.0.0.1"),
            port=int(os.environ.get("MOOMOO_PORT", "11111")),
            security_firm=os.environ.get("MOOMOO_SECURITY_FIRM", "FUTUSG"),
            trd_env=os.environ.get("MOOMOO_TRD_ENV", "SIMULATE"),
            markets=tuple(os.environ.get("MOOMOO_MARKETS", "US,HK").split(",")),
        )
    return _CLIENT

"""SSE broadcaster for live price ticks.

One asyncio task started in app lifespan. During US RTH it fetches a
moomoo market snapshot every 20s, recomputes USD-aggregated holdings
+ a watchlist payload, and fan-outs the JSON to per-client
asyncio.Queues. Out of RTH the loop emits SSE keepalive comments
only. Single shared snapshot per tick — N connected browsers cost
one moomoo call, not N.

Design constraints (from plan/v3-phase-d5-execution.md):
- 20s tick cadence, US-RTH gated.
- No client logic — payload mirrors /api/holdings exactly so the
  frontend just swaps values into existing render paths.
- New client connect: replay last payload immediately, then live
  ticks, so first paint after a navigation is instant.
- Slow client = drop. SSE auto-reconnect recovers; we don't
  back-pressure the broadcast loop on one slow tab.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time as _time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from api import fx
from api.data import quotes as quotes_mod
from api.data.moomoo_client import get_summary
from api.market_hours import ET, is_us_rth, next_open

log = logging.getLogger(__name__)

TICK_SECONDS = 20
KEEPALIVE_SECONDS = 15
LOOP_PERIOD_SECONDS = 1


@dataclass(eq=False)
class Subscriber:
    queue: asyncio.Queue[str] = field(default_factory=lambda: asyncio.Queue(maxsize=8))


class Broadcaster:
    def __init__(self) -> None:
        self._subs: set[Subscriber] = set()
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._last_market_open: bool | None = None
        self._last_tick_payload: str | None = None

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="realtime-broadcaster")
        log.info("realtime broadcaster started")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=2)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()
            self._task = None
        log.info("realtime broadcaster stopped")

    def subscribe(self) -> Subscriber:
        sub = Subscriber()
        self._subs.add(sub)
        if self._last_tick_payload is not None:
            try:
                sub.queue.put_nowait(self._last_tick_payload)
            except asyncio.QueueFull:
                pass
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        self._subs.discard(sub)

    async def _run(self) -> None:
        last_tick_mono = -TICK_SECONDS  # fire immediately on first iteration when RTH
        last_keepalive_mono = -KEEPALIVE_SECONDS
        while not self._stop.is_set():
            now_et = datetime.now(tz=ET)
            market_open = is_us_rth(now_et)

            if self._last_market_open is not None and market_open != self._last_market_open:
                payload: dict[str, Any] = {"market": "open" if market_open else "closed"}
                if not market_open:
                    payload["next_open_iso"] = next_open(now_et).isoformat()
                await self._broadcast(_format_event("market_status", payload))
            self._last_market_open = market_open

            mono = _time.monotonic()

            if market_open and (mono - last_tick_mono) >= TICK_SECONDS:
                try:
                    tick_payload = await asyncio.to_thread(_build_tick)
                    msg = _format_event("tick", tick_payload)
                    self._last_tick_payload = msg
                    await self._broadcast(msg)
                except Exception as exc:
                    log.warning("realtime tick failed: %s", exc)
                last_tick_mono = mono

            if (mono - last_keepalive_mono) >= KEEPALIVE_SECONDS:
                await self._broadcast(": keepalive\n\n")
                last_keepalive_mono = mono

            try:
                await asyncio.wait_for(self._stop.wait(), timeout=LOOP_PERIOD_SECONDS)
            except asyncio.TimeoutError:
                pass

    async def _broadcast(self, msg: str) -> None:
        dead: list[Subscriber] = []
        for sub in list(self._subs):
            try:
                sub.queue.put_nowait(msg)
            except asyncio.QueueFull:
                dead.append(sub)
        for sub in dead:
            self._subs.discard(sub)


def _format_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


def _resolve_watchlist_codes() -> list[str]:
    from api.routes.watchlist import _watchlist_codes
    try:
        return _watchlist_codes()
    except Exception as exc:
        log.warning("watchlist resolution failed: %s", exc)
        return []


def _build_tick() -> dict[str, Any]:
    summary = get_summary()
    holdings_payload = _build_holdings_payload(summary)
    watchlist_payload = _build_watchlist_payload(_resolve_watchlist_codes())
    return {
        "server_ts": int(_time.time()),
        "market": "open",
        "holdings": holdings_payload,
        "watchlist": watchlist_payload,
    }


def _build_holdings_payload(summary: Any) -> dict[str, Any]:
    """Mirrors `routes/holdings.py:list_holdings` USD-aggregation.

    Inlined here for the skeleton chunk — chunk 3 extracts to a shared
    helper so this and the REST route call identical math.
    """
    holdings: list[dict[str, Any]] = []
    total_mv_usd = 0.0
    total_pnl_usd = 0.0
    currencies_native: dict[str, float] = {}

    for p in summary.positions:
        mv_usd, _ = fx.convert(p.market_value, p.currency, "USD")
        pnl_usd, _ = fx.convert(p.total_pnl_abs, p.currency, "USD")
        holdings.append({
            "code": p.code, "ticker": p.ticker, "name": p.name,
            "market": p.market, "currency": p.currency,
            "qty": p.qty, "cost_basis": p.cost_basis,
            "current_price": p.current_price,
            "market_value": p.market_value, "market_value_usd": mv_usd,
            "today_change_pct": p.today_change_pct,
            "today_change_abs": p.today_change_abs,
            "total_pnl_pct": p.total_pnl_pct,
            "total_pnl_abs": p.total_pnl_abs,
            "total_pnl_abs_usd": pnl_usd,
        })
        total_mv_usd += mv_usd
        total_pnl_usd += pnl_usd
        currencies_native[p.currency] = currencies_native.get(p.currency, 0.0) + p.market_value

    cost_usd = total_mv_usd - total_pnl_usd
    total_pnl_pct = (total_pnl_usd / cost_usd) if cost_usd > 0 else 0.0

    return {
        "holdings": holdings,
        "total_market_value_usd": total_mv_usd,
        "total_pnl_abs_usd": total_pnl_usd,
        "total_pnl_pct": total_pnl_pct,
        "currencies": currencies_native,
        "fx_rates_used": fx.rates_used_snapshot(),
        "last_updated": summary.last_updated.isoformat(),
        "fresh": summary.fresh,
        "simulate_with_no_positions": summary.simulate_with_no_positions,
    }


def _build_watchlist_payload(codes: list[str]) -> list[dict[str, Any]]:
    if not codes:
        return []
    try:
        quote_map = quotes_mod.get_quotes(codes)
    except Exception as exc:
        log.warning("watchlist quote fetch failed: %s", exc)
        return []
    out: list[dict[str, Any]] = []
    for c in codes:
        q = quote_map.get(c)
        out.append({
            "code": c,
            "last_price": q.last_price if q else None,
            "today_change_pct": q.today_change_pct if q else None,
        })
    return out


broadcaster = Broadcaster()

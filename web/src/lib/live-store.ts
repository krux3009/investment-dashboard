// Tiny dep-free pub/sub store backing the realtime SSE stream.
//
// One global store instance; SSE provider (use-live-prices.ts) owns the
// EventSource connection and dispatches updates via setState. Components
// subscribe via useSyncExternalStore + a slice selector so a Hero update
// does not cause every holdings row to re-render.

import { useSyncExternalStore } from "react";
import type { Holding, HoldingsResponse } from "./api";

export type MarketStatus = "open" | "closed" | "unknown";

export interface LiveWatchlistQuote {
  code: string;
  last_price: number | null;
  today_change_pct: number | null;
}

export interface LiveTickPayload {
  server_ts: number;
  market: "open";
  holdings: HoldingsResponse;
  watchlist: LiveWatchlistQuote[];
}

export interface LiveState {
  // Stream-level
  connected: boolean;
  market: MarketStatus;
  lastTickAt: number | null; // server_ts seconds
  nextOpenIso: string | null;
  // Slice payload — null until first tick lands
  totals: {
    total_market_value_usd: number;
    total_pnl_abs_usd: number;
    total_pnl_pct: number;
  } | null;
  holdings: Map<string, Holding>;
  watchlist: Map<string, LiveWatchlistQuote>;
}

const initialState: LiveState = {
  connected: false,
  market: "unknown",
  lastTickAt: null,
  nextOpenIso: null,
  totals: null,
  holdings: new Map(),
  watchlist: new Map(),
};

type Listener = () => void;

let state: LiveState = initialState;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function getLiveState(): LiveState {
  return state;
}

export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setConnected(connected: boolean): void {
  if (state.connected === connected) return;
  state = { ...state, connected };
  emit();
}

export function applyTick(tick: LiveTickPayload): void {
  const holdings = new Map<string, Holding>();
  for (const h of tick.holdings.holdings) holdings.set(h.code, h);
  const watchlist = new Map<string, LiveWatchlistQuote>();
  for (const q of tick.watchlist) watchlist.set(q.code, q);

  state = {
    ...state,
    market: "open",
    lastTickAt: tick.server_ts,
    nextOpenIso: null,
    totals: {
      total_market_value_usd: tick.holdings.total_market_value_usd,
      total_pnl_abs_usd: tick.holdings.total_pnl_abs_usd,
      total_pnl_pct: tick.holdings.total_pnl_pct,
    },
    holdings,
    watchlist,
  };
  emit();
}

export function applyMarketStatus(market: MarketStatus, nextOpenIso: string | null): void {
  if (state.market === market && state.nextOpenIso === nextOpenIso) return;
  state = { ...state, market, nextOpenIso };
  emit();
}

// ── Selector hooks ─────────────────────────────────────────────────────────

function useSlice<T>(selector: (s: LiveState) => T): T {
  // useSyncExternalStore requires the snapshot getter to return a stable
  // reference between calls when nothing changed. Selectors that build a
  // fresh object every call would loop. We rely on Map identity here:
  // applyTick swaps the Map; selectors return the Map or a primitive.
  return useSyncExternalStore(subscribeLive, () => selector(state), () => selector(initialState));
}

export function useLiveConnected(): boolean {
  return useSlice((s) => s.connected);
}

export function useLiveMarket(): { market: MarketStatus; lastTickAt: number | null; nextOpenIso: string | null } {
  // Three small primitives in one object — must memoize via dependent useSlice
  // so identity is stable when none changed.
  const market = useSlice((s) => s.market);
  const lastTickAt = useSlice((s) => s.lastTickAt);
  const nextOpenIso = useSlice((s) => s.nextOpenIso);
  return { market, lastTickAt, nextOpenIso };
}

export function useLiveTotals(): LiveState["totals"] {
  return useSlice((s) => s.totals);
}

export function useLiveHolding(code: string): Holding | null {
  return useSlice((s) => s.holdings.get(code) ?? null);
}

export function useLiveWatchlistQuote(code: string): LiveWatchlistQuote | null {
  return useSlice((s) => s.watchlist.get(code) ?? null);
}

// Test-only — reset between dev hot-reloads.
export function _resetLiveState(): void {
  state = initialState;
  emit();
}

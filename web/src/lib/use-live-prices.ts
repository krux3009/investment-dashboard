// SSE provider hook + auto-reconnect. Mount at the page root once.
//
// Opens one EventSource against /api/stream/prices, dispatches `tick` and
// `market_status` events into live-store. Browser EventSource auto-
// reconnects on transport errors with backoff; this hook just makes sure
// the global connected flag tracks reality so the LiveIndicator can dim.

"use client";

import { useEffect } from "react";
import {
  applyMarketStatus,
  applyTick,
  setConnected,
  type LiveTickPayload,
  type MarketStatus,
} from "./live-store";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export function useLivePrices(): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const url = `${API_BASE}/api/stream/prices`;
    const es = new EventSource(url, { withCredentials: false });

    const onOpen = () => setConnected(true);
    const onError = () => setConnected(false);
    const onTick = (e: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(e.data) as LiveTickPayload;
        applyTick(payload);
      } catch (err) {
        // Drop malformed payloads; SSE is best-effort.
        if (process.env.NODE_ENV !== "production") {
          console.warn("live tick parse failed", err);
        }
      }
    };
    const onMarketStatus = (e: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(e.data) as { market: MarketStatus; next_open_iso?: string | null };
        applyMarketStatus(payload.market, payload.next_open_iso ?? null);
      } catch {
        /* drop */
      }
    };

    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);
    es.addEventListener("tick", onTick as EventListener);
    es.addEventListener("market_status", onMarketStatus as EventListener);

    return () => {
      es.removeEventListener("open", onOpen);
      es.removeEventListener("error", onError);
      es.removeEventListener("tick", onTick as EventListener);
      es.removeEventListener("market_status", onMarketStatus as EventListener);
      es.close();
      setConnected(false);
    };
  }, []);
}

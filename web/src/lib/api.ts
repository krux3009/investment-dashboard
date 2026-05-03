// API client for the FastAPI backend.
// Types mirror api/models.py — keep in sync.

export type Currency =
  | "USD" | "HKD" | "CNH" | "JPY" | "SGD" | "AUD" | "MYR" | "CAD" | "?";

export type Market =
  | "US" | "HK" | "CN" | "JP" | "SG" | "AU" | "MY" | "CA" | "?";

export interface Holding {
  code: string;
  ticker: string;
  name: string;
  market: Market;
  currency: Currency;
  qty: number;
  cost_basis: number;
  current_price: number;
  market_value: number;
  market_value_usd: number;
  today_change_pct: number | null;
  today_change_abs: number | null;
  total_pnl_pct: number;
  total_pnl_abs: number;
  total_pnl_abs_usd: number;
}

export interface HoldingsResponse {
  holdings: Holding[];
  total_market_value_usd: number;
  total_pnl_abs_usd: number;
  total_pnl_pct: number;
  currencies: Record<string, number>;
  fx_rates_used: Record<string, number>;
  last_updated: string;
  fresh: boolean;
  simulate_with_no_positions: boolean;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export async function fetchHoldings(): Promise<HoldingsResponse> {
  const res = await fetch(`${API_BASE}/api/holdings`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/holdings ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as HoldingsResponse;
}

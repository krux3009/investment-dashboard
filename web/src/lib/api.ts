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

export interface PricePoint {
  date: string;
  close: number;
}

export interface PriceHistory {
  code: string;
  days: number;
  points: PricePoint[];
}

export async function fetchPrices(code: string, days = 30): Promise<PriceHistory> {
  const url = `${API_BASE}/api/prices/${encodeURIComponent(code)}?days=${days}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/prices/${code} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as PriceHistory;
}

export interface AnomalyItem {
  kind: "technical" | "capital";
  label: string;
  content: string;
}

export interface AnomaliesResponse {
  code: string;
  items: AnomalyItem[];
}

export async function fetchAnomalies(code: string): Promise<AnomaliesResponse> {
  const url = `${API_BASE}/api/anomalies/${encodeURIComponent(code)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/anomalies/${code} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as AnomaliesResponse;
}

export interface WatchlistResponse {
  codes: string[];
}

export async function fetchWatchlist(): Promise<WatchlistResponse> {
  const res = await fetch(`${API_BASE}/api/watchlist`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/watchlist ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as WatchlistResponse;
}

export interface DigestResponse {
  prose: string;
  generated_at: string;
  holdings_covered: string[];
  cached: boolean;
}

export type DigestResult =
  | { ok: true; data: DigestResponse }
  | { ok: false; status: number; detail: string };

export async function fetchDigest(refresh = false): Promise<DigestResult> {
  const url = `${API_BASE}/api/digest${refresh ? "?refresh=true" : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      detail = await res.text();
    }
    return { ok: false, status: res.status, detail };
  }
  return { ok: true, data: (await res.json()) as DigestResponse };
}

export interface InsightResponse {
  code: string;
  ticker: string;
  meaning: string;
  watch: string;
  generated_at: string;
  cached: boolean;
}

export type InsightResult =
  | { ok: true; data: InsightResponse }
  | { ok: false; status: number; detail: string };

export async function fetchInsight(code: string, refresh = false): Promise<InsightResult> {
  const url = `${API_BASE}/api/insight/${encodeURIComponent(code)}${refresh ? "?refresh=true" : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      detail = await res.text();
    }
    return { ok: false, status: res.status, detail };
  }
  return { ok: true, data: (await res.json()) as InsightResponse };
}

export interface EarningsItem {
  code: string;
  ticker: string;
  name: string;
  date: string;          // ISO date "2026-06-25"
  days_until: number;
  eps_low: number | null;
  eps_high: number | null;
  eps_avg: number | null;
  revenue_low: number | null;
  revenue_high: number | null;
  revenue_avg: number | null;
}

export interface EarningsResponse {
  items: EarningsItem[];
  next_within_14: boolean;
}

export async function fetchEarnings(): Promise<EarningsResponse> {
  const res = await fetch(`${API_BASE}/api/earnings`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/earnings ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as EarningsResponse;
}

export interface EarningsInsightResponse {
  code: string;
  ticker: string;
  what: string;
  meaning: string;
  watch: string;
  generated_at: string;
  cached: boolean;
}

export type EarningsInsightResult =
  | { ok: true; data: EarningsInsightResponse }
  | { ok: false; status: number; detail: string };

export async function fetchEarningsInsight(
  code: string,
  refresh = false,
): Promise<EarningsInsightResult> {
  const url = `${API_BASE}/api/earnings-insight/${encodeURIComponent(code)}${refresh ? "?refresh=true" : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      detail = await res.text();
    }
    return { ok: false, status: res.status, detail };
  }
  return { ok: true, data: (await res.json()) as EarningsInsightResponse };
}

export type PreviewKind = "us_futures" | "asia_close";

export interface PreviewRow {
  symbol: string;
  label: string;
  kind: PreviewKind;
  last_price: number;
  previous_close: number;
  change_pct: number;
}

export interface PreviewResponse {
  rows: PreviewRow[];
  in_window: boolean;
  fetched_at: string;
}

export async function fetchPreview(): Promise<PreviewResponse> {
  const res = await fetch(`${API_BASE}/api/preview`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/preview ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as PreviewResponse;
}

export interface PreviewInsightResponse {
  symbol: string;
  label: string;
  what: string;
  meaning: string;
  watch: string;
  generated_at: string;
  cached: boolean;
}

export type PreviewInsightResult =
  | { ok: true; data: PreviewInsightResponse }
  | { ok: false; status: number; detail: string };

export async function fetchPreviewInsight(
  symbol: string,
  refresh = false,
): Promise<PreviewInsightResult> {
  const url = `${API_BASE}/api/preview-insight/${encodeURIComponent(symbol)}${refresh ? "?refresh=true" : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      detail = await res.text();
    }
    return { ok: false, status: res.status, detail };
  }
  return { ok: true, data: (await res.json()) as PreviewInsightResponse };
}

export interface Note {
  code: string;
  body: string;
  updated_at: string;
}

export type NoteResult =
  | { ok: true; data: Note | null }
  | { ok: false; status: number; detail: string };

export async function fetchNote(code: string): Promise<NoteResult> {
  const url = `${API_BASE}/api/notes/${encodeURIComponent(code)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return { ok: true, data: null };
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      detail = await res.text();
    }
    return { ok: false, status: res.status, detail };
  }
  return { ok: true, data: (await res.json()) as Note };
}

export type PutNoteResult =
  | { ok: true; data: Note | null }
  | { ok: false; status: number; detail: string };

export async function putNote(code: string, body: string): Promise<PutNoteResult> {
  const url = `${API_BASE}/api/notes/${encodeURIComponent(code)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
    cache: "no-store",
  });
  if (res.status === 204) return { ok: true, data: null };
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch {
      detail = await res.text();
    }
    return { ok: false, status: res.status, detail };
  }
  return { ok: true, data: (await res.json()) as Note };
}

export async function deleteNote(code: string): Promise<{ ok: boolean }> {
  const url = `${API_BASE}/api/notes/${encodeURIComponent(code)}`;
  const res = await fetch(url, { method: "DELETE", cache: "no-store" });
  return { ok: res.status === 204 };
}

export interface SeriesPoint {
  trade_date: string;
  pct: number;
}

export interface BenchmarkSeries {
  symbol: string;
  points: SeriesPoint[];
}

export interface BenchmarkResponse {
  days: number;
  symbols: string[];
  as_of: string;
  portfolio: SeriesPoint[];
  benchmarks: BenchmarkSeries[];
  weighting_caveat: string;
}

export async function fetchBenchmark(
  days = 90,
  symbols?: string,
): Promise<BenchmarkResponse> {
  const qs = new URLSearchParams({ days: String(days) });
  if (symbols) qs.set("symbols", symbols);
  const url = `${API_BASE}/api/benchmark?${qs}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/benchmark ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as BenchmarkResponse;
}

export interface BenchmarkInsightResponse {
  days: number;
  symbols: string[];
  what: string;
  meaning: string;
  watch: string;
  generated_at: string;
  cached: boolean;
}

export type BenchmarkInsightResult =
  | { ok: true; data: BenchmarkInsightResponse }
  | { ok: false; status: number; detail: string };

export async function fetchBenchmarkInsight(
  days = 90,
  symbols?: string,
  refresh = false,
): Promise<BenchmarkInsightResult> {
  const qs = new URLSearchParams({ days: String(days) });
  if (symbols) qs.set("symbols", symbols);
  if (refresh) qs.set("refresh", "true");
  const url = `${API_BASE}/api/benchmark-insight?${qs}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      detail = await res.text();
    }
    return { ok: false, status: res.status, detail };
  }
  return { ok: true, data: (await res.json()) as BenchmarkInsightResponse };
}

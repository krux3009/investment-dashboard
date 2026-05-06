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
  time_range: number;
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

export interface Quote {
  code: string;
  last_price: number | null;
  prev_close: number | null;
  today_change_pct: number | null;
  today_change_abs: number | null;
}

export interface QuotesResponse {
  quotes: Record<string, Quote>;
}

export async function fetchQuotes(codes: string[]): Promise<QuotesResponse> {
  if (codes.length === 0) return { quotes: {} };
  const url = `${API_BASE}/api/quotes?codes=${encodeURIComponent(codes.join(","))}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/quotes ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as QuotesResponse;
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
  available?: boolean;
}

export type InsightResult =
  | { ok: true; data: InsightResponse | null }
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
  const data = (await res.json()) as InsightResponse;
  if (data.available === false) return { ok: true, data: null };
  return { ok: true, data };
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
  const note = (await res.json()) as Note;
  // Backend now returns 200 with body="" when no note exists yet.
  // Collapse that to null so consumers can use a single "no note" path.
  if (!note.body) return { ok: true, data: null };
  return { ok: true, data: note };
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

export interface TopName {
  code: string;
  ticker: string;
  pct: number;
}

export interface ConcentrationResponse {
  count: number;
  total_market_value_usd: number;
  top1_pct: number;
  top3_pct: number;
  top5_pct: number;
  top_names: TopName[];
  currency_exposure: Record<string, number>;
  single_name_max: TopName | null;
}

export async function fetchConcentration(): Promise<ConcentrationResponse> {
  const res = await fetch(`${API_BASE}/api/concentration`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/concentration ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as ConcentrationResponse;
}

export interface ConcentrationInsightResponse {
  what: string;
  meaning: string;
  watch: string;
  generated_at: string;
  cached: boolean;
}

export type ConcentrationInsightResult =
  | { ok: true; data: ConcentrationInsightResponse }
  | { ok: false; status: number; detail: string };

export async function fetchConcentrationInsight(
  refresh = false,
): Promise<ConcentrationInsightResult> {
  const url = `${API_BASE}/api/concentration-insight${refresh ? "?refresh=true" : ""}`;
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
  return { ok: true, data: (await res.json()) as ConcentrationInsightResponse };
}

export type ForesightKind = "earnings" | "macro" | "company_event";

export interface ForesightEvent {
  event_id: string;
  date: string;
  days_until: number;
  kind: ForesightKind;
  code: string | null;
  ticker: string | null;
  label: string;
  description: string;
}

export interface ForesightResponse {
  days: number;
  as_of: string;
  holdings_covered: string[];
  events: ForesightEvent[];
}

export async function fetchForesight(days = 7): Promise<ForesightResponse> {
  const res = await fetch(`${API_BASE}/api/foresight?days=${days}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`/api/foresight ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as ForesightResponse;
}

export interface ForesightInsightResponse {
  event_id: string;
  what: string;
  meaning: string;
  watch: string;
  generated_at: string;
  cached: boolean;
}

export type ForesightInsightResult =
  | { ok: true; data: ForesightInsightResponse }
  | { ok: false; status: number; detail: string };

export async function fetchForesightInsight(
  eventId: string,
  days = 30,
  refresh = false,
): Promise<ForesightInsightResult> {
  const qs = new URLSearchParams({ days: String(days) });
  if (refresh) qs.set("refresh", "true");
  const url = `${API_BASE}/api/foresight-insight/${encodeURIComponent(eventId)}?${qs}`;
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
  return { ok: true, data: (await res.json()) as ForesightInsightResponse };
}

export type SentimentBucket = "positive" | "neutral" | "negative";

export interface RedditMention {
  subreddit: string;
  post_id: string;
  title: string;
  url: string;
  score: number;
  num_comments: number;
  classification: SentimentBucket;
}

export interface RedditResponse {
  code: string;
  days: number;
  total_mentions: number;
  buckets: Record<SentimentBucket, number>;
  weighted_score: number;
  top_mentions: RedditMention[];
  as_of: string;
}

export type RedditResult =
  | { ok: true; data: RedditResponse }
  | { ok: false; status: number; detail: string };

export async function fetchReddit(code: string, days = 7): Promise<RedditResult> {
  const url = `${API_BASE}/api/reddit/${encodeURIComponent(code)}?days=${days}`;
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
  return { ok: true, data: (await res.json()) as RedditResponse };
}

export interface SentimentInsightResponse {
  code: string;
  what: string;
  meaning: string;
  watch: string;
  generated_at: string;
  cached: boolean;
  available?: boolean;
}

export type SentimentInsightResult =
  | { ok: true; data: SentimentInsightResponse | null }
  | { ok: false; status: number; detail: string };

export async function fetchSentimentInsight(
  code: string,
  refresh = false,
): Promise<SentimentInsightResult> {
  const url = `${API_BASE}/api/sentiment-insight/${encodeURIComponent(code)}${
    refresh ? "?refresh=true" : ""
  }`;
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
  const data = (await res.json()) as SentimentInsightResponse;
  if (data.available === false) return { ok: true, data: null };
  return { ok: true, data };
}

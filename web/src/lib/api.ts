// API client for the FastAPI backend.
// Types mirror api/models.py — keep in sync.
//
// One error convention: every fetcher goes through `apiGet<T>` and throws
// `Error("<path> <status>: <body>")` on a non-ok response. The only
// exceptions are the notes + reddit fetchers, which return a Result union
// because their callers render 404/503 states inline instead of erroring.

import type { Locale } from "@/lib/i18n/locale-provider";

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
  total_today_change_abs_usd: number;
  total_today_change_pct: number;
  currencies: Record<string, number>;
  fx_rates_used: Record<string, number>;
  last_updated: string;
  fresh: boolean;
  simulate_with_no_positions: boolean;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${path.split("?")[0]} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// Network-level failure (backend down, CORS) → error result instead of an
// unhandled rejection inside the component effect that fired the fetch.
const NETWORK_ERR = {
  ok: false as const,
  status: 0,
  detail: "backend unreachable",
};

async function fetchOrNull(url: string): Promise<Response | null> {
  try {
    return await fetch(url, { cache: "no-store" });
  } catch {
    return null;
  }
}

async function errDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail ?? `${res.status}`;
  } catch {
    return await res.text();
  }
}

export function fetchHoldings(): Promise<HoldingsResponse> {
  return apiGet("/api/holdings");
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

export function fetchPrices(code: string, days = 30): Promise<PriceHistory> {
  return apiGet(`/api/prices/${encodeURIComponent(code)}?days=${days}`);
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

export function fetchAnomalies(
  code: string,
  locale: Locale = "en",
): Promise<AnomaliesResponse> {
  return apiGet(`/api/anomalies/${encodeURIComponent(code)}?locale=${locale}`);
}

export interface WatchlistResponse {
  codes: string[];
}

export function fetchWatchlist(): Promise<WatchlistResponse> {
  return apiGet("/api/watchlist");
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
  return apiGet(`/api/quotes?codes=${encodeURIComponent(codes.join(","))}`);
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

export function fetchEarnings(): Promise<EarningsResponse> {
  return apiGet("/api/earnings");
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
  const res = await fetchOrNull(url);
  if (!res) return NETWORK_ERR;
  if (!res.ok) {
    return { ok: false, status: res.status, detail: await errDetail(res) };
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
    return { ok: false, status: res.status, detail: await errDetail(res) };
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

export function fetchBenchmark(
  days = 90,
  symbols?: string,
): Promise<BenchmarkResponse> {
  const qs = new URLSearchParams({ days: String(days) });
  if (symbols) qs.set("symbols", symbols);
  return apiGet(`/api/benchmark?${qs}`);
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

export function fetchConcentration(): Promise<ConcentrationResponse> {
  return apiGet("/api/concentration");
}

export type ForesightKind = "earnings" | "macro" | "company_event" | "exdiv";

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

export interface DailyPnlEntry {
  date: string;
  pnl_usd: number;
  pnl_pct: number;
  value_usd: number;
}

export interface DailyPnlResponse {
  start: string;
  end: string;
  as_of: string;
  entries: DailyPnlEntry[];
}

export function fetchDailyPnl(
  opts: { start: string; end: string },
): Promise<DailyPnlResponse> {
  return apiGet(`/api/daily-pnl?start=${opts.start}&end=${opts.end}`);
}

export type ForesightFetchOpts =
  | { days?: number }
  | { start: string; end: string };

export function fetchForesight(
  opts: ForesightFetchOpts | number = 7,
  locale: Locale = "en",
): Promise<ForesightResponse> {
  const normalized: ForesightFetchOpts =
    typeof opts === "number" ? { days: opts } : opts;
  const qs =
    "start" in normalized
      ? `start=${normalized.start}&end=${normalized.end}`
      : `days=${normalized.days ?? 7}`;
  return apiGet(`/api/foresight?${qs}&locale=${locale}`);
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
  const res = await fetchOrNull(url);
  if (!res) return NETWORK_ERR;
  if (!res.ok) {
    return { ok: false, status: res.status, detail: await errDetail(res) };
  }
  return { ok: true, data: (await res.json()) as RedditResponse };
}

export interface DividendPayment {
  ex_date: string;
  amount_per_share_native: number;
  amount_total_native: number;
  amount_total_usd: number;
}

export interface HoldingDividend {
  code: string;
  ticker: string;
  name: string;
  currency: string;
  shares_held: number;
  is_reit: boolean;
  next_ex_date: string | null;
  next_amount_per_share_native: number | null;
  next_amount_total_usd: number | null;
  ttm_per_share_native: number;
  ttm_total_native: number;
  ttm_total_usd: number;
  history_count: number;
  history: DividendPayment[];
}

export interface DividendsResponse {
  as_of: string;
  items: HoldingDividend[];
  totals: {
    ttm_total_usd: number;
    next_30d_total_usd: number;
    next_90d_total_usd: number;
  };
  rates_used: Record<string, number>;
}

export function fetchDividends(): Promise<DividendsResponse> {
  return apiGet("/api/dividends");
}

export interface SnowflakeScores {
  past: number | null;
  health: number | null;
  dividends: number | null;
  valuation: number | null;
  future: number | null;
}

export interface PortfolioSnowflake {
  scores: SnowflakeScores;
  weights: Record<string, number>;
  generated_at: string;
  cached: boolean;
}

export interface SnowflakeResponse {
  code: string;
  ticker: string;
  scores: SnowflakeScores;
  generated_at: string;
  cached: boolean;
  available: boolean;
}

export function fetchPortfolioSnowflake(
  locale: Locale = "en",
): Promise<PortfolioSnowflake> {
  return apiGet(`/api/snowflake/portfolio?locale=${locale}`);
}

export function fetchSnowflake(
  code: string,
  locale: Locale = "en",
): Promise<SnowflakeResponse> {
  return apiGet(`/api/snowflake/${encodeURIComponent(code)}?locale=${locale}`);
}

// ── returns (P5) ─────────────────────────────────────────────────────

export interface ReturnsSummary {
  unrealized_usd: number;
  realized_usd: number;
  dividends_usd: number;
  currency_impact_usd: number;
  total_usd: number;
  partial: boolean;
  missing: string[];
  as_of: string;
}

export interface ReturnsHolding {
  code: string;
  ticker: string;
  name: string;
  shares: number;
  avg_price: number;
  current_price: number;
  value_usd: number;
  cost_basis_usd: number;
  unrealized_usd: number;
  unrealized_pct: number;
  dividends_ttm_usd: number;
  total_gain_usd: number;
  total_gain_pct: number;
}

export interface ReturnsDetail {
  as_of: string;
  holdings: ReturnsHolding[];
}

export function fetchReturnsSummary(): Promise<ReturnsSummary> {
  return apiGet("/api/returns/summary");
}

export function fetchReturnsDetail(): Promise<ReturnsDetail> {
  return apiGet("/api/returns/detail");
}

// ── dividends forecast + buckets (P5/P3) ─────────────────────────────

export interface DividendForecastHolding {
  code: string;
  ticker: string;
  name: string;
  payment_12m_usd: number;
  yield_pct: number | null;
  yield_on_cost_pct: number | null;
  score: number | null;
  growth_pct: number | null;
}

export interface DividendForecastResponse {
  horizon: "12m" | "24m" | "36m";
  total_usd: number;
  monthly_avg_usd: number;
  as_of: string;
  holdings: DividendForecastHolding[];
}

export type Horizon = "12m" | "24m" | "36m";

export function fetchDividendForecast(horizon: Horizon = "12m"): Promise<DividendForecastResponse> {
  return apiGet(`/api/dividends/forecast?horizon=${horizon}`);
}

export interface DividendBucketStats {
  total_usd: number;
  count: number;
  pct: number;
}

export interface DividendQualityResponse {
  as_of: string;
  total_usd: number;
  buckets: {
    low: DividendBucketStats;
    medium: DividendBucketStats;
    high: DividendBucketStats;
  };
}

export function fetchDividendQualityBuckets(): Promise<DividendQualityResponse> {
  return apiGet("/api/dividends/quality-buckets");
}

// ── portfolio metrics + fair value (P5/P3) ───────────────────────────

export interface SectorTicker {
  code: string;
  name: string;
  weight_pct: number;
  industry?: string | null;
}

export interface SectorBucket {
  sector: string;
  weight_pct: number;
  tickers: SectorTicker[];
}

export function fetchSectors(): Promise<SectorBucket[]> {
  return apiGet("/api/portfolio/sectors");
}

export interface GeographyTicker {
  code: string;
  name: string;
  weight_pct: number;
  country?: string | null;
}

export interface GeographyBucket {
  region: string;
  weight_pct: number;
  tickers: GeographyTicker[];
}

export function fetchGeography(): Promise<GeographyBucket[]> {
  return apiGet("/api/portfolio/geography");
}

export interface TopHolding {
  code: string;
  name: string;
  weight_pct: number;
  value_usd: number;
}

export function fetchTopHoldings(n = 10): Promise<TopHolding[]> {
  return apiGet(`/api/portfolio/top-holdings?n=${n}`);
}

export interface ValuationHolding {
  code: string;
  ticker: string;
  current_usd: number;
  fair_usd: number | null;
  pct_diff: number | null;
}

export interface ValuationResponse {
  cash_flow_value_usd: number;
  total_value_usd: number;
  pct_diff: number | null;
  per_holding: ValuationHolding[];
  coverage_count: number;
  total_count: number;
}

export function fetchValuation(): Promise<ValuationResponse> {
  return apiGet("/api/portfolio/valuation");
}

export interface GaugeResponse {
  portfolio: number | null;
  market: number;
  scale_max: number;
  excluded_count: number;
  total_count: number;
  label: string;
}

export function fetchPeGauge(): Promise<GaugeResponse> {
  return apiGet("/api/portfolio/pe-vs-market");
}

export function fetchPsGauge(): Promise<GaugeResponse> {
  return apiGet("/api/portfolio/ps-vs-market");
}

export function fetchPegGauge(): Promise<GaugeResponse> {
  return apiGet("/api/portfolio/peg-vs-market");
}

// ── Analysis axis sub-tabs (v5): Future / Past / Health ──────────────────────
// Growth + ratio fields are fractions (0.20 = +20%); the view multiplies ×100.

export interface FutureHolding {
  code: string;
  ticker: string;
  name: string;
  weight_pct: number | null;
  eps_growth: number | null;
  rev_growth: number | null;
}

export interface FutureResponse {
  portfolio_eps_growth: number | null;
  portfolio_rev_growth: number | null;
  index_growth: number | null;
  per_holding: FutureHolding[];
  covered_count: number;
  total_count: number;
}

export function fetchFuture(): Promise<FutureResponse> {
  return apiGet("/api/portfolio/future");
}

export interface PastHolding {
  code: string;
  ticker: string;
  name: string;
  weight_pct: number | null;
  rev_cagr: number | null;
  earnings_cagr: number | null;
}

export interface PastResponse {
  portfolio_rev_cagr: number | null;
  portfolio_earnings_cagr: number | null;
  per_holding: PastHolding[];
  covered_count: number;
  total_count: number;
}

export function fetchPast(): Promise<PastResponse> {
  return apiGet("/api/portfolio/past");
}

export interface HealthHolding {
  code: string;
  ticker: string;
  name: string;
  weight_pct: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
}

export interface HealthResponse {
  portfolio_debt_to_equity: number | null;
  portfolio_current_ratio: number | null;
  per_holding: HealthHolding[];
  covered_count: number;
  total_count: number;
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiGet("/api/portfolio/health");
}

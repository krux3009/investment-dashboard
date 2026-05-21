import {
  fetchBenchmark,
  fetchConcentration,
  fetchDailyPnl,
  fetchDividends,
  fetchEarnings,
  fetchForesight,
  fetchHoldings,
  fetchPortfolioSnowflake,
  fetchPrices,
  fetchReturnsSummary,
  fetchSnowflake,
} from "@/lib/api";
import type {
  BenchmarkResponse,
  ConcentrationResponse,
  DailyPnlResponse,
  DividendsResponse,
  EarningsItem,
  EarningsResponse,
  ForesightResponse,
  HoldingDividend,
  PortfolioSnowflake,
  PriceHistory,
  ReturnsSummary,
  SnowflakeScores,
} from "@/lib/api";
import { Suspense } from "react";
import { HoldingsTable } from "@/components/holdings-table";
import { BlockSkeleton } from "@/components/block-skeleton";
import { ConcentrationBlock } from "@/components/concentration-block";
import { DividendLedgerBlock } from "@/components/dividend-ledger-block";
import { PortfolioTabNav, type PortfolioTab } from "@/components/portfolio-tab-nav";
import { PortfolioHeading } from "@/components/portfolio-heading";
import { CalendarView } from "@/components/calendar-view";
import { PerformanceChartCard } from "@/components/performance-chart-card";
import { PortfolioSnowflakeCard } from "@/components/portfolio-snowflake-card";
import { HoldingsKpiStrip } from "@/components/holdings-kpi-strip";
import { ReturnsTab } from "@/components/returns-tab";
import { UpdatesTab } from "@/components/updates-tab";
import { DividendsTab } from "@/components/dividends-tab";
import { AnalysisTab } from "@/components/analysis-tab";

const TAB_KEYS: PortfolioTab[] = [
  "holdings", "returns", "updates", "dividends", "analysis", "calendar",
];

function parseTab(raw: string | undefined): PortfolioTab {
  if (!raw) return "holdings";
  if (raw === "table") return "holdings";  // backward compat
  return (TAB_KEYS as string[]).includes(raw) ? (raw as PortfolioTab) : "holdings";
}

async function safeFetchEarnings(): Promise<EarningsResponse> {
  try {
    return await fetchEarnings();
  } catch (e) {
    console.warn("fetchEarnings failed, hiding strip:", e);
    return { items: [], next_within_14: false };
  }
}

async function safeFetchBenchmark(): Promise<BenchmarkResponse | null> {
  try {
    return await fetchBenchmark(90);
  } catch (e) {
    console.warn("fetchBenchmark failed, hiding block:", e);
    return null;
  }
}

async function safeFetchConcentration(): Promise<ConcentrationResponse | null> {
  try {
    return await fetchConcentration();
  } catch (e) {
    console.warn("fetchConcentration failed, hiding block:", e);
    return null;
  }
}

async function safeFetchDividends(): Promise<DividendsResponse | null> {
  try {
    return await fetchDividends();
  } catch (e) {
    console.warn("fetchDividends failed, hiding block:", e);
    return null;
  }
}

async function safeFetchPortfolioSnowflake(): Promise<PortfolioSnowflake | null> {
  try {
    return await fetchPortfolioSnowflake();
  } catch (e) {
    console.warn("fetchPortfolioSnowflake failed:", e);
    return null;
  }
}

async function safeFetchReturns(): Promise<ReturnsSummary | null> {
  try {
    return await fetchReturnsSummary();
  } catch (e) {
    console.warn("fetchReturnsSummary failed:", e);
    return null;
  }
}

async function fetchSnowflakeMap(
  codes: string[],
): Promise<Record<string, SnowflakeScores>> {
  const results = await Promise.allSettled(codes.map((c) => fetchSnowflake(c)));
  const map: Record<string, SnowflakeScores> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.available) {
      map[codes[i]] = r.value.scores;
    }
  });
  return map;
}

async function safeFetchDailyPnl(
  opts: { start: string; end: string },
): Promise<DailyPnlResponse> {
  try {
    return await fetchDailyPnl(opts);
  } catch (e) {
    console.warn("fetchDailyPnl failed, calendar omits P&L:", e);
    const now = new Date();
    return {
      start: opts.start,
      end: opts.end,
      as_of: now.toISOString().slice(0, 10),
      entries: [],
    };
  }
}

async function safeFetchForesight(
  opts: { days?: number } | { start: string; end: string },
): Promise<ForesightResponse> {
  try {
    return await fetchForesight(opts);
  } catch (e) {
    console.warn("fetchForesight failed, calendar shows empty:", e);
    const now = new Date();
    const days =
      "start" in opts
        ? Math.max(
            0,
            Math.round(
              (new Date(opts.end).getTime() - new Date(opts.start).getTime()) /
                86_400_000,
            ),
          )
        : opts.days ?? 7;
    return {
      days,
      as_of: now.toISOString().slice(0, 10),
      holdings_covered: [],
      events: [],
    };
  }
}

async function fetchSparklineMap(
  codes: string[],
): Promise<Record<string, PriceHistory>> {
  const results = await Promise.allSettled(codes.map((c) => fetchPrices(c, 30)));
  const map: Record<string, PriceHistory> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") map[codes[i]] = r.value;
  });
  return map;
}

const EX_DIV_SOON_DAYS = 14;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// Mirrors calendar-view.tsx cell builder: 42-day window starting from the
// Sunday on or before the 1st of the visible month.
function calendarWindow(
  year: number,
  month: number,
): { start: string; end: string } {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return { start: fmt(start), end: fmt(end) };
}

interface PageProps {
  searchParams: Promise<{ tab?: string; month?: string }>;
}

export default async function Portfolio({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  return (
    <>
      <header className="mb-6">
        <PortfolioHeading />
      </header>
      <PortfolioTabNav active={tab} />
      {await renderTabContent(tab, sp)}
    </>
  );
}

async function renderTabContent(
  tab: PortfolioTab,
  sp: { tab?: string; month?: string },
) {
  if (tab === "calendar") {
    const { year, month } = parseMonth(sp.month);
    const window = calendarWindow(year, month);
    const [foresight, dailyPnl] = await Promise.all([
      safeFetchForesight(window),
      safeFetchDailyPnl(window),
    ]);
    return (
      <CalendarView
        initial={foresight}
        dailyPnl={dailyPnl}
        year={year}
        month={month}
      />
    );
  }

  if (tab === "returns") {
    return <ReturnsTab />;
  }

  if (tab === "updates") {
    return <UpdatesTab />;
  }

  if (tab === "analysis") {
    return <AnalysisTab />;
  }

  if (tab === "dividends") {
    return <DividendsTab />;
  }

  // ── Holdings tab (default) ──────────────────────────────────────
  const [data, earnings, dividends, benchmark, portfolioSnowflake, returns] =
    await Promise.all([
      fetchHoldings(),
      safeFetchEarnings(),
      safeFetchDividends(),
      safeFetchBenchmark(),
      safeFetchPortfolioSnowflake(),
      safeFetchReturns(),
    ]);

  const codes = data.holdings.map((h) => h.code);
  const [sparklines, snowflakeScores] = await Promise.all([
    fetchSparklineMap(codes),
    fetchSnowflakeMap(codes),
  ]);
  const earningsByCode: Record<string, EarningsItem> = {};
  for (const e of earnings.items) earningsByCode[e.code] = e;

  const dividendsByCode: Record<string, HoldingDividend> = {};
  if (dividends) {
    const today = new Date();
    for (const i of dividends.items) {
      if (!i.next_ex_date) continue;
      const ex = new Date(i.next_ex_date);
      const daysUntil = Math.ceil((ex.getTime() - today.getTime()) / 86_400_000);
      if (daysUntil >= 0 && daysUntil <= EX_DIV_SOON_DAYS) {
        dividendsByCode[i.code] = i;
      }
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* 2-col header: PerformanceChartCard (left, 2/3 width) + SnowflakeCard (right, 1/3 width) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <PerformanceChartCard
          initial={benchmark}
          totalValueUsd={data.total_market_value_usd}
          holdingsCount={data.holdings.length}
          totalPnlAbsUsd={data.total_pnl_abs_usd}
          totalPnlPct={data.total_pnl_pct}
          todayPnlAbsUsd={data.total_today_change_abs_usd}
          todayPnlPct={data.total_today_change_pct}
        />
        <PortfolioSnowflakeCard
          scores={
            portfolioSnowflake?.scores ?? {
              valuation: null, future: null, past: null, health: null, dividends: null,
            }
          }
          available={portfolioSnowflake != null}
          holdingsCount={data.holdings.length}
        />
      </div>

      {/* KPI strip — wired to /api/returns/summary (realized + currency
       *  stubbed until transaction-history layer ships). */}
      <HoldingsKpiStrip
        available={returns != null}
        unrealizedValue={returns ? fmtUsdSigned(returns.unrealized_usd) : "—"}
        unrealizedSign={returns ? (returns.unrealized_usd >= 0 ? "pos" : "neg") : null}
        dividendsValue={returns ? fmtUsd(returns.dividends_usd) : "—"}
        partial={returns?.partial ?? false}
      />

      {/* Holdings table */}
      <HoldingsTable
        holdings={data.holdings}
        sparklines={sparklines}
        earningsByCode={earningsByCode}
        dividendsByCode={dividendsByCode}
        snowflakeScoresByCode={snowflakeScores}
      />

      {/* Concentration kept here in P2; migrates to Analysis tab in P3 */}
      <Suspense fallback={<BlockSkeleton lines={4} />}>
        <ConcentrationSection />
      </Suspense>
    </div>
  );
}

async function ConcentrationSection() {
  const concentration = await safeFetchConcentration();
  return concentration ? <ConcentrationBlock initial={concentration} /> : null;
}

function fmtUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtUsdSigned(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${fmtUsd(Math.abs(value))}`;
}


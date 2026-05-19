import {
  fetchBenchmark,
  fetchConcentration,
  fetchDailyPnl,
  fetchDividends,
  fetchEarnings,
  fetchForesight,
  fetchHoldings,
  fetchPrices,
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
  PriceHistory,
} from "@/lib/api";
import { Suspense } from "react";
import { HoldingsTable } from "@/components/holdings-table";
import { BlockSkeleton } from "@/components/block-skeleton";
import { ConcentrationBlock } from "@/components/concentration-block";
import { DividendLedgerBlock } from "@/components/dividend-ledger-block";
import { PortfolioTabNav, type PortfolioTab } from "@/components/portfolio-tab-nav";
import { CalendarView } from "@/components/calendar-view";
import { PerformanceChartCard } from "@/components/performance-chart-card";
import { SnowflakeCard } from "@/components/snowflake-card";
import { KpiStrip } from "@/components/kpi-strip";

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
        <h1 className="font-serif text-3xl font-medium text-ink">My Portfolio</h1>
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

  if (tab === "returns" || tab === "updates" || tab === "analysis") {
    return <ComingSoonPanel tab={tab} />;
  }

  if (tab === "dividends") {
    // P2 partial: render existing DividendLedgerBlock here (was on Holdings
    // tab in v3). Full Dividends-tab content lands in P3.
    const dividends = await safeFetchDividends();
    return (
      <div className="flex flex-col gap-10">
        <ComingSoonPanel tab={tab} preview="DividendLedgerBlock kept from v3 below — full tab content in P3." />
        {dividends ? <DividendLedgerBlock initial={dividends} /> : null}
      </div>
    );
  }

  // ── Holdings tab (default) ──────────────────────────────────────
  const [data, earnings, dividends, benchmark] = await Promise.all([
    fetchHoldings(),
    safeFetchEarnings(),
    safeFetchDividends(),
    safeFetchBenchmark(),
  ]);

  const sparklines = await fetchSparklineMap(data.holdings.map((h) => h.code));
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
        <SnowflakeCard
          heading="Portfolio Snowflake"
          scores={{ valuation: null, future: null, past: 4, health: 3, dividends: 4 }}
          summary="Snapshot pending — scores ship in P5 backend."
          holdingsCount={data.holdings.length}
          holdingsCountLabel={`${data.holdings.length} holdings`}
        />
      </div>

      {/* KPI strip — stubbed values until backend P5 */}
      <KpiStrip
        tiles={[
          { label: "Unrealized Returns", value: "—", sub: "Pending P5" },
          { label: "Realized Returns", value: "—", sub: "Pending P5" },
          { label: "Dividends", value: "—", sub: "Pending P5" },
          { label: "Currency Impact", value: "—", sub: "Pending P5" },
        ]}
        caption="Stubbed — /api/returns/summary wires up in P5."
      />

      {/* Holdings table */}
      <HoldingsTable
        holdings={data.holdings}
        sparklines={sparklines}
        earningsByCode={earningsByCode}
        dividendsByCode={dividendsByCode}
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

function ComingSoonPanel({ tab, preview }: { tab: PortfolioTab; preview?: string }) {
  const TITLE: Record<PortfolioTab, string> = {
    holdings: "Holdings",
    returns: "Returns",
    updates: "Updates",
    dividends: "Dividends",
    analysis: "Analysis",
    calendar: "Calendar",
  };
  return (
    <section className="rounded-xl border border-dashed border-rule bg-surface-raised p-10 flex flex-col items-center gap-2 text-center">
      <p className="text-sm font-medium text-ink">{TITLE[tab]} tab</p>
      <p className="text-xs text-quiet max-w-[44ch]">
        Coming in P3 — wired up next phase. The SWS-faithful surface design is
        approved; backend aggregators land first.
      </p>
      {preview ? (
        <p className="text-[11px] text-whisper italic mt-2">{preview}</p>
      ) : null}
    </section>
  );
}

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
import { BenchmarkBlock } from "@/components/benchmark-block";
import { BlockSkeleton } from "@/components/block-skeleton";
import { ConcentrationBlock } from "@/components/concentration-block";
import { DividendLedgerBlock } from "@/components/dividend-ledger-block";
import { PortfolioTabNav } from "@/components/portfolio-tab-nav";
import { CalendarView } from "@/components/calendar-view";

async function BenchmarkSection() {
  const benchmark = await safeFetchBenchmark();
  return benchmark ? <BenchmarkBlock initial={benchmark} /> : null;
}

async function ConcentrationSection() {
  const concentration = await safeFetchConcentration();
  return concentration ? <ConcentrationBlock initial={concentration} /> : null;
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
  const tab = sp.tab === "calendar" ? "calendar" : "table";

  if (tab === "calendar") {
    const { year, month } = parseMonth(sp.month);
    const window = calendarWindow(year, month);
    const [foresight, dailyPnl] = await Promise.all([
      safeFetchForesight(window),
      safeFetchDailyPnl(window),
    ]);
    return (
      <>
        <PortfolioTabNav active="calendar" />
        <CalendarView
          initial={foresight}
          dailyPnl={dailyPnl}
          year={year}
          month={month}
        />
      </>
    );
  }

  const [data, earnings, dividends] = await Promise.all([
    fetchHoldings(),
    safeFetchEarnings(),
    safeFetchDividends(),
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
    <>
      <PortfolioTabNav active="table" />
      <Suspense fallback={<BlockSkeleton lines={6} />}>
        <BenchmarkSection />
      </Suspense>
      <HoldingsTable
        holdings={data.holdings}
        sparklines={sparklines}
        earningsByCode={earningsByCode}
        dividendsByCode={dividendsByCode}
      />
      <Suspense fallback={<BlockSkeleton lines={4} />}>
        <ConcentrationSection />
      </Suspense>
      {dividends && <DividendLedgerBlock initial={dividends} />}
    </>
  );
}

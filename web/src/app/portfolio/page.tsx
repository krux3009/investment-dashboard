import {
  fetchBenchmark,
  fetchConcentration,
  fetchDividends,
  fetchEarnings,
  fetchForesight,
  fetchHoldings,
  fetchPrices,
} from "@/lib/api";
import type {
  BenchmarkResponse,
  ConcentrationResponse,
  DividendsResponse,
  EarningsItem,
  EarningsResponse,
  ForesightResponse,
  HoldingDividend,
  PriceHistory,
} from "@/lib/api";
import { HoldingsTable } from "@/components/holdings-table";
import { BenchmarkBlock } from "@/components/benchmark-block";
import { ConcentrationBlock } from "@/components/concentration-block";
import { DividendLedgerBlock } from "@/components/dividend-ledger-block";
import { PortfolioTabNav } from "@/components/portfolio-tab-nav";
import { CalendarView } from "@/components/calendar-view";

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

async function safeFetchForesight(days: number): Promise<ForesightResponse> {
  try {
    return await fetchForesight(days);
  } catch (e) {
    console.warn("fetchForesight failed, calendar shows empty:", e);
    const now = new Date();
    return {
      days,
      as_of: now.toISOString().slice(0, 10),
      holdings_covered: [],
      events: [],
    };
  }
}

const EX_DIV_SOON_DAYS = 14;

function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function daysNeededForMonth(year: number, month: number): number {
  // Cover the last visible cell of the 6×7 grid plus a 7-day buffer.
  const firstOfMonth = new Date(year, month - 1, 1);
  const startSunday = new Date(firstOfMonth);
  startSunday.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const lastCell = new Date(startSunday);
  lastCell.setDate(startSunday.getDate() + 41);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (lastCell.getTime() - today.getTime()) / 86_400_000,
  );
  // Clamp to the route's [1, 90] range. 30 minimum keeps current-month
  // fetch parity with the existing /api/foresight?days=30 default usage.
  return Math.min(Math.max(diff + 7, 30), 90);
}

interface PageProps {
  searchParams: Promise<{ tab?: string; month?: string }>;
}

export default async function Portfolio({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = sp.tab === "calendar" ? "calendar" : "table";

  if (tab === "calendar") {
    const { year, month } = parseMonth(sp.month);
    const foresight = await safeFetchForesight(daysNeededForMonth(year, month));
    return (
      <>
        <PortfolioTabNav active="calendar" />
        <CalendarView initial={foresight} year={year} month={month} />
      </>
    );
  }

  const [data, earnings, benchmark, concentration, dividends] = await Promise.all([
    fetchHoldings(),
    safeFetchEarnings(),
    safeFetchBenchmark(),
    safeFetchConcentration(),
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
      {benchmark && <BenchmarkBlock initial={benchmark} />}
      <HoldingsTable
        holdings={data.holdings}
        sparklines={sparklines}
        earningsByCode={earningsByCode}
        dividendsByCode={dividendsByCode}
      />
      {concentration && <ConcentrationBlock initial={concentration} />}
      {dividends && <DividendLedgerBlock initial={dividends} />}
    </>
  );
}

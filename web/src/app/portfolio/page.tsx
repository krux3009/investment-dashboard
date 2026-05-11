import {
  fetchBenchmark,
  fetchConcentration,
  fetchDividends,
  fetchEarnings,
  fetchHoldings,
  fetchPrices,
} from "@/lib/api";
import type {
  BenchmarkResponse,
  ConcentrationResponse,
  DividendsResponse,
  EarningsItem,
  EarningsResponse,
  HoldingDividend,
  PriceHistory,
} from "@/lib/api";
import { HoldingsTable } from "@/components/holdings-table";
import { BenchmarkBlock } from "@/components/benchmark-block";
import { ConcentrationBlock } from "@/components/concentration-block";
import { DividendLedgerBlock } from "@/components/dividend-ledger-block";

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

const EX_DIV_SOON_DAYS = 14;

export default async function Portfolio() {
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

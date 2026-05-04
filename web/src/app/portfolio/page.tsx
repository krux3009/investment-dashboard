import {
  fetchBenchmark,
  fetchConcentration,
  fetchEarnings,
  fetchHoldings,
  fetchPrices,
} from "@/lib/api";
import type {
  BenchmarkResponse,
  ConcentrationResponse,
  EarningsItem,
  EarningsResponse,
  PriceHistory,
} from "@/lib/api";
import { HoldingsTable } from "@/components/holdings-table";
import { BenchmarkBlock } from "@/components/benchmark-block";
import { ConcentrationBlock } from "@/components/concentration-block";

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

export default async function Portfolio() {
  const [data, earnings, benchmark, concentration] = await Promise.all([
    fetchHoldings(),
    safeFetchEarnings(),
    safeFetchBenchmark(),
    safeFetchConcentration(),
  ]);

  const sparklines = await fetchSparklineMap(data.holdings.map((h) => h.code));
  const earningsByCode: Record<string, EarningsItem> = {};
  for (const e of earnings.items) earningsByCode[e.code] = e;

  return (
    <>
      {benchmark && <BenchmarkBlock initial={benchmark} />}
      <HoldingsTable
        holdings={data.holdings}
        sparklines={sparklines}
        earningsByCode={earningsByCode}
      />
      {concentration && <ConcentrationBlock initial={concentration} />}
    </>
  );
}

import { fetchBenchmark, fetchEarnings, fetchHoldings, fetchPrices, fetchWatchlist } from "@/lib/api";
import type { BenchmarkResponse, EarningsItem, EarningsResponse, PriceHistory } from "@/lib/api";
import { Hero } from "@/components/hero";
import { HoldingsTable } from "@/components/holdings-table";
import { WatchlistTable } from "@/components/watchlist-table";
import { ThemeToggle } from "@/components/theme-toggle";
import { DailyDigest } from "@/components/daily-digest";
import { EarningsStrip } from "@/components/earnings-strip";
import { PreviewBlock } from "@/components/preview-block";
import { BenchmarkBlock } from "@/components/benchmark-block";

async function fetchSparklineMap(codes: string[]): Promise<Record<string, PriceHistory>> {
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
    // yfinance occasionally rate-limits or returns malformed payloads.
    // Earnings are nice-to-have on a single page render — if the call
    // fails we just hide the strip rather than bail the whole page.
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

export default async function Home() {
  // Holdings + watchlist + earnings fetch in parallel; sparklines depend
  // on the codes returned, so they fetch in a second round.
  const [data, watchlist, earnings, benchmark] = await Promise.all([
    fetchHoldings(),
    fetchWatchlist(),
    safeFetchEarnings(),
    safeFetchBenchmark(),
  ]);

  const holdingsCodes = data.holdings.map((h) => h.code);
  const watchlistCodes = watchlist.codes;
  const allCodes = Array.from(new Set([...holdingsCodes, ...watchlistCodes]));
  const sparklines = await fetchSparklineMap(allCodes);

  const earningsByCode: Record<string, EarningsItem> = {};
  for (const e of earnings.items) earningsByCode[e.code] = e;

  return (
    <main className="max-w-6xl mx-auto px-8 py-12">
      <header className="flex items-baseline justify-between mb-12">
        <div className="text-sm font-medium tracking-wide text-quiet">
          quiet ledger
        </div>
        <ThemeToggle />
      </header>

      <Hero data={data} />
      {benchmark && <BenchmarkBlock initial={benchmark} />}
      <DailyDigest />
      <EarningsStrip items={earnings.items} />
      <HoldingsTable
        holdings={data.holdings}
        sparklines={sparklines}
        earningsByCode={earningsByCode}
      />
      <WatchlistTable codes={watchlistCodes} sparklines={sparklines} />
      <PreviewBlock />
    </main>
  );
}

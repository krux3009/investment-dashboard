import { fetchHoldings, fetchPrices, fetchWatchlist } from "@/lib/api";
import type { PriceHistory } from "@/lib/api";
import { Hero } from "@/components/hero";
import { HoldingsTable } from "@/components/holdings-table";
import { WatchlistTable } from "@/components/watchlist-table";
import { ThemeToggle } from "@/components/theme-toggle";
import { DailyDigest } from "@/components/daily-digest";

async function fetchSparklineMap(codes: string[]): Promise<Record<string, PriceHistory>> {
  const results = await Promise.allSettled(codes.map((c) => fetchPrices(c, 30)));
  const map: Record<string, PriceHistory> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") map[codes[i]] = r.value;
  });
  return map;
}

export default async function Home() {
  // Holdings + watchlist fetch in parallel; sparklines depend on the codes
  // returned, so they fetch in a second round.
  const [data, watchlist] = await Promise.all([
    fetchHoldings(),
    fetchWatchlist(),
  ]);

  const holdingsCodes = data.holdings.map((h) => h.code);
  const watchlistCodes = watchlist.codes;
  const allCodes = Array.from(new Set([...holdingsCodes, ...watchlistCodes]));
  const sparklines = await fetchSparklineMap(allCodes);

  return (
    <main className="max-w-6xl mx-auto px-8 py-12">
      <header className="flex items-baseline justify-between mb-12">
        <div className="text-sm font-medium tracking-wide text-quiet">
          quiet ledger
        </div>
        <ThemeToggle />
      </header>

      <Hero data={data} />
      <DailyDigest />
      <HoldingsTable holdings={data.holdings} sparklines={sparklines} />
      <WatchlistTable codes={watchlistCodes} sparklines={sparklines} />
    </main>
  );
}

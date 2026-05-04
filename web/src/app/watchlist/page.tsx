import { fetchPrices, fetchQuotes, fetchWatchlist } from "@/lib/api";
import type { PriceHistory, Quote } from "@/lib/api";
import { WatchlistTable } from "@/components/watchlist-table";

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

async function safeFetchQuotes(codes: string[]): Promise<Record<string, Quote>> {
  try {
    const r = await fetchQuotes(codes);
    return r.quotes;
  } catch (e) {
    console.warn("fetchQuotes failed, today's change column hidden:", e);
    return {};
  }
}

export default async function Watchlist() {
  const watchlist = await fetchWatchlist();
  const [sparklines, quotes] = await Promise.all([
    fetchSparklineMap(watchlist.codes),
    safeFetchQuotes(watchlist.codes),
  ]);

  return (
    <WatchlistTable
      codes={watchlist.codes}
      sparklines={sparklines}
      quotes={quotes}
    />
  );
}

import { fetchPrices, fetchWatchlist } from "@/lib/api";
import type { PriceHistory } from "@/lib/api";
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

export default async function Watchlist() {
  const watchlist = await fetchWatchlist();
  const sparklines = await fetchSparklineMap(watchlist.codes);

  return <WatchlistTable codes={watchlist.codes} sparklines={sparklines} />;
}

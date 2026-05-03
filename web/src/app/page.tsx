import { fetchHoldings, fetchPrices } from "@/lib/api";
import type { PriceHistory } from "@/lib/api";
import { Hero } from "@/components/hero";
import { HoldingsTable } from "@/components/holdings-table";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Home() {
  const data = await fetchHoldings();

  // Fetch 30d sparkline data in parallel for fast first paint. A failure
  // for one symbol shouldn't break the page; allSettled keeps the others.
  const sparkResults = await Promise.allSettled(
    data.holdings.map((h) => fetchPrices(h.code, 30))
  );
  const sparklines: Record<string, PriceHistory> = {};
  sparkResults.forEach((r, i) => {
    const code = data.holdings[i].code;
    if (r.status === "fulfilled") sparklines[code] = r.value;
  });

  return (
    <main className="max-w-6xl mx-auto px-8 py-12">
      <header className="flex items-baseline justify-between mb-12">
        <div className="text-sm font-medium tracking-wide text-quiet">
          quiet ledger
        </div>
        <ThemeToggle />
      </header>

      <Hero data={data} />
      <HoldingsTable holdings={data.holdings} sparklines={sparklines} />
    </main>
  );
}

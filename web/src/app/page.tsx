import { fetchHoldings } from "@/lib/api";
import { Hero } from "@/components/hero";
import { HoldingsTable } from "@/components/holdings-table";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Home() {
  const data = await fetchHoldings();

  return (
    <main className="max-w-5xl mx-auto px-8 py-12">
      <header className="flex items-baseline justify-between mb-12">
        <div className="text-sm font-medium tracking-wide text-quiet">
          quiet ledger
        </div>
        <ThemeToggle />
      </header>

      <Hero data={data} />
      <HoldingsTable holdings={data.holdings} />
    </main>
  );
}

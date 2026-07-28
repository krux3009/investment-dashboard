/**
 * Dev-only visual harness for v4 SWS-faithful primitives. Open at
 * /__components in dev — production renders 404.
 *
 * Mounts every new primitive (Snowflake / KpiTile / ComparisonGauge)
 * with mock data so we can eyeball each in isolation before wiring
 * them into real surfaces.
 */

import { notFound } from "next/navigation";
import { Snowflake } from "@/components/snowflake";
import { KpiTile } from "@/components/kpi-tile";
import { ComparisonGauge } from "@/components/comparison-gauge";
import { BenchmarkChart } from "@/components/benchmark-chart";
import type { BenchmarkResponse } from "@/lib/api";

// 60 mock trading days: portfolio drifts to +12%, SPY to +6%, with a dip.
const MOCK_BENCHMARK: BenchmarkResponse = (() => {
  const days = 60;
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(2026, 3, 1);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const wave = (i: number, end: number, dip: number) =>
    (i / (days - 1)) * end + dip * Math.sin((i / (days - 1)) * Math.PI * 2);
  return {
    days,
    symbols: ["SPY"],
    as_of: dates[days - 1],
    portfolio: dates.map((trade_date, i) => ({
      trade_date,
      pct: wave(i, 0.12, -0.02),
    })),
    benchmarks: [
      {
        symbol: "SPY",
        points: dates.map((trade_date, i) => ({
          trade_date,
          pct: wave(i, 0.06, -0.01),
        })),
      },
    ],
    weighting_caveat: "mock",
  };
})();

export default function ComponentDemoPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="flex flex-col gap-12 py-8">
      <header className="border-b border-rule pb-4">
        <p className="text-[10px] uppercase tracking-[0.1em] text-quiet">dev only · v4 primitives</p>
        <h1 className="font-serif text-3xl font-medium text-ink mt-1">SWS-faithful component harness</h1>
        <p className="text-sm text-quiet mt-2">
          Visual sanity check for{" "}
          <code className="text-ink">Snowflake</code>,{" "}
          <code className="text-ink">KpiTile</code>,{" "}
          <code className="text-ink">ComparisonGauge</code>. Toggle theme via header.
        </p>
      </header>

      {/* Snowflake variants */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-quiet">Snowflake</h2>
        <div className="flex flex-wrap items-end gap-8 rounded-xl border border-rule bg-surface-raised p-6">
          <div className="flex flex-col items-center gap-2">
            <Snowflake
              size={240}
              scores={{ valuation: null, future: null, past: 6, health: 4, dividends: 5 }}
            />
            <span className="text-[11px] text-quiet">240 · realistic (V+F greyed)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Snowflake
              size={96}
              scores={{ valuation: 3, future: 2, past: 5, health: 4, dividends: 5 }}
            />
            <span className="text-[11px] text-quiet">96 · full data</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Snowflake size={28} scores={{ past: 5, health: 3, dividends: 4 }} />
            <span className="text-[11px] text-quiet">28 · mini (table row)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Snowflake
              size={96}
              scores={{ valuation: null, future: null, past: null, health: null, dividends: null }}
            />
            <span className="text-[11px] text-quiet">96 · all null</span>
          </div>
        </div>
      </section>

      {/* KpiTile strip */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-quiet">KpiTile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="Unrealized Returns"
            value="US$201,505"
            delta={{ signed: "+US$201,505", pct: "91.4%", sign: "pos" }}
          />
          <KpiTile
            label="Realized Returns"
            value="US$52,591"
            delta={{ signed: "+US$52,591", pct: "23.9%", sign: "pos" }}
          />
          <KpiTile
            label="Dividends"
            value="US$15,078"
            delta={{ signed: "+US$15,078", pct: "6.8%", sign: "pos" }}
          />
          <KpiTile
            label="Currency Impact"
            value="−US$662"
            delta={{ signed: "−US$662", pct: "0.4%", sign: "neg" }}
          />
        </div>
      </section>

      {/* ComparisonGauge */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-quiet">
          ComparisonGauge
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <ComparisonGauge
            title="Price to Earnings"
            portfolio={27.3}
            reference={18.4}
            scaleMax={60}
            unit="x"
            referenceLabel="US Market"
          />
          <ComparisonGauge
            title="Price to Sales"
            portfolio={5}
            reference={2.3}
            scaleMax={20}
            unit="x"
            referenceLabel="US Market"
          />
          <ComparisonGauge
            title="Price to Expected Growth"
            portfolio={4}
            reference={1.5}
            scaleMax={4}
            unit="x"
            referenceLabel="US Market"
            sub="1 holding excluded due to missing forward-earnings data."
          />
        </div>
      </section>

      {/* BenchmarkChart — crosshair/tooltip hover layer + solid zero line */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-quiet">
          BenchmarkChart (hover for crosshair · arrow keys when focused)
        </h2>
        <div className="rounded-xl border border-rule bg-surface-raised p-6 max-w-2xl">
          <BenchmarkChart data={MOCK_BENCHMARK} />
        </div>
      </section>
    </div>
  );
}

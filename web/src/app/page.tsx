import { Suspense } from "react";
import { fetchForesight, fetchHoldings } from "@/lib/api";
import type { ForesightResponse } from "@/lib/api";
import { Hero } from "@/components/hero";
import { DailyDigest } from "@/components/daily-digest";
import { ForesightBlock } from "@/components/foresight-block";
import { BlockSkeleton } from "@/components/block-skeleton";
import { KpiStrip } from "@/components/kpi-strip";

async function safeFetchForesight(): Promise<ForesightResponse | null> {
  try {
    return await fetchForesight(7);
  } catch (e) {
    console.warn("fetchForesight failed, hiding block:", e);
    return null;
  }
}

async function ForesightSection() {
  const foresight = await safeFetchForesight();
  return foresight ? <ForesightBlock initial={foresight} /> : null;
}

export default async function Home() {
  const data = await fetchHoldings();

  return (
    <>
      {/* Hero: total + signed P&L + per-currency caption + 96px snowflake.
       *  Snowflake scores stubbed until P5 wires /api/snowflake/portfolio. */}
      <Hero
        data={data}
        snowflakeScores={{ valuation: null, future: null, past: 4, health: 3, dividends: 4 }}
      />

      {/* KPI strip: Unrealized · Realized · Dividends · Currency Impact.
       *  Stubbed until P5 wires /api/returns/summary. */}
      <div className="mb-10">
        <KpiStrip
          tiles={[
            { label: "Unrealized Returns", value: "—", sub: "Pending P5" },
            { label: "Realized Returns",   value: "—", sub: "Pending P5" },
            { label: "Dividends",          value: "—", sub: "Pending P5" },
            { label: "Currency Impact",    value: "—", sub: "Pending P5" },
          ]}
          caption="Stubbed — /api/returns/summary wires up in P5."
        />
      </div>

      <DailyDigest />
      <Suspense fallback={<BlockSkeleton lines={5} />}>
        <ForesightSection />
      </Suspense>
    </>
  );
}

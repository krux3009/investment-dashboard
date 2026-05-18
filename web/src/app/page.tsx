import { Suspense } from "react";
import { fetchForesight, fetchHoldings } from "@/lib/api";
import type { ForesightResponse } from "@/lib/api";
import { Hero } from "@/components/hero";
import { DailyDigest } from "@/components/daily-digest";
import { ForesightBlock } from "@/components/foresight-block";
import { BlockSkeleton } from "@/components/block-skeleton";

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
      <Hero data={data} />
      <DailyDigest />
      <Suspense fallback={<BlockSkeleton lines={5} />}>
        <ForesightSection />
      </Suspense>
    </>
  );
}

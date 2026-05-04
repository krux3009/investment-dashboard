import { fetchForesight, fetchHoldings } from "@/lib/api";
import type { ForesightResponse } from "@/lib/api";
import { Hero } from "@/components/hero";
import { DailyDigest } from "@/components/daily-digest";
import { ForesightBlock } from "@/components/foresight-block";

async function safeFetchForesight(): Promise<ForesightResponse | null> {
  try {
    return await fetchForesight(7);
  } catch (e) {
    console.warn("fetchForesight failed, hiding block:", e);
    return null;
  }
}

export default async function Home() {
  const [data, foresight] = await Promise.all([
    fetchHoldings(),
    safeFetchForesight(),
  ]);

  return (
    <>
      <Hero data={data} />
      <DailyDigest />
      {foresight && <ForesightBlock initial={foresight} />}
    </>
  );
}

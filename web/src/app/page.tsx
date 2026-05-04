import { fetchHoldings } from "@/lib/api";
import { Hero } from "@/components/hero";
import { DailyDigest } from "@/components/daily-digest";
import { PreviewBlock } from "@/components/preview-block";

export default async function Home() {
  const data = await fetchHoldings();

  return (
    <>
      <Hero data={data} />
      <DailyDigest />
      <PreviewBlock />
    </>
  );
}

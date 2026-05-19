import { PortfolioTabNav } from "@/components/portfolio-tab-nav";
import { BlockSkeleton } from "@/components/block-skeleton";

export default function Loading() {
  return (
    <>
      <PortfolioTabNav active="holdings" />
      <BlockSkeleton lines={6} />
      <div className="animate-pulse" aria-hidden>
        <div className="space-y-px">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 border-b border-rule" />
          ))}
        </div>
      </div>
    </>
  );
}

import { BlockSkeleton } from "@/components/block-skeleton";

export default function Loading() {
  return (
    <>
      <div className="animate-pulse mb-8" aria-hidden>
        <div className="h-12 w-56 bg-surface-zebra mb-4 rounded-sm" />
        <div className="h-4 w-40 bg-surface-zebra/60 rounded-sm" />
      </div>
      <BlockSkeleton lines={6} />
    </>
  );
}

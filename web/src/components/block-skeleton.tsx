export function BlockSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="animate-pulse mb-8" aria-hidden>
      <div className="h-4 w-32 bg-surface-zebra mb-3 rounded-sm" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 w-full bg-surface-zebra/60 mb-2 rounded-sm"
        />
      ))}
    </div>
  );
}

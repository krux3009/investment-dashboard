// Shared horizontal proportional bar. One implementation for the
// concentration / sentiment / returns breakdown bars that each used to
// hand-roll their own width math.
//
// Purely presentational (no hooks) so it renders in both server and
// client components.

export interface StackedBarSegment {
  key: string;
  pct: number; // 0-100 width share
  className?: string; // tailwind background class
  color?: string; // or an inline background (CSS var)
  title?: string;
  ariaLabel?: string;
}

export function StackedBar({
  segments,
  className = "h-1.5 rounded-sm bg-rule/40",
  minPct = 0,
}: {
  segments: StackedBarSegment[];
  className?: string; // height + rounding + track color
  minPct?: number; // hide slivers below this width
}) {
  return (
    <div className={`flex w-full overflow-hidden ${className}`}>
      {segments.map((s) =>
        s.pct <= minPct ? null : (
          <div
            key={s.key}
            className={s.className}
            style={{
              width: `${s.pct}%`,
              ...(s.color ? { background: s.color } : {}),
            }}
            title={s.title}
            aria-label={s.ariaLabel}
          />
        ),
      )}
    </div>
  );
}

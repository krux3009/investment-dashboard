import type { PricePoint } from "@/lib/api";

interface Props {
  points: PricePoint[];
  // Direction tint: gain / loss / quiet. Caller decides based on the
  // window's net change.
  direction?: "gain" | "loss" | "quiet";
  width?: number;
  height?: number;
}

const STROKE_VAR = {
  gain: "var(--gain)",
  loss: "var(--loss)",
  quiet: "var(--quiet)",
} as const;

// Hand-rolled SVG sparkline: a single SVG path scaled into a fixed
// viewBox. No Recharts, no ResponsiveContainer, no SSR pitfalls — just
// 30 close prices mapped to a polyline. SSR-renderable.
export function Sparkline({
  points,
  direction = "quiet",
  width = 96,
  height = 28,
}: Props) {
  if (!points || points.length < 2) {
    return (
      <div
        className="text-whisper text-xs tabular"
        style={{ width, height, lineHeight: `${height}px`, textAlign: "center" }}
      >
        –
      </div>
    );
  }

  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const padX = 2;
  const padY = 2;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = innerW / (closes.length - 1);

  const d = closes
    .map((c, i) => {
      const x = padX + stepX * i;
      const y = padY + innerH - ((c - min) / range) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`30-day price trend, ${direction}`}
    >
      <path
        d={d}
        fill="none"
        stroke={STROKE_VAR[direction]}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

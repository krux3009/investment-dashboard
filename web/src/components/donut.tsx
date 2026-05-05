import type { Holding } from "@/lib/api";

interface Props {
  holdings: Holding[];
  size?: number;
}

const SLICE_VARS = [
  "var(--slice-1)",
  "var(--slice-2)",
  "var(--slice-3)",
  "var(--slice-4)",
  "var(--slice-5)",
  "var(--slice-6)",
  "var(--slice-7)",
] as const;

interface Slice {
  ticker: string;
  value: number;
  color: string;
  startAngle: number;
  endAngle: number;
  fraction: number;
}

// Build the SVG path for a donut slice between [startAngle, endAngle]
// (radians, 0 = 12 o'clock, clockwise).
function arcPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const sin = Math.sin;
  const cos = Math.cos;

  // SVG y-axis is flipped; "0 = up" → use sin for x and -cos for y.
  const x0o = cx + outerR * sin(startAngle);
  const y0o = cy - outerR * cos(startAngle);
  const x1o = cx + outerR * sin(endAngle);
  const y1o = cy - outerR * cos(endAngle);
  const x0i = cx + innerR * sin(startAngle);
  const y0i = cy - innerR * cos(startAngle);
  const x1i = cx + innerR * sin(endAngle);
  const y1i = cy - innerR * cos(endAngle);

  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${x0o.toFixed(2)} ${y0o.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)}`,
    `L ${x1i.toFixed(2)} ${y1i.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function Donut({ holdings, size = 200 }: Props) {
  if (holdings.length === 0) return null;

  // Largest first → darkest tint, per SLICE_TINTS convention.
  const sorted = [...holdings].sort(
    (a, b) => b.market_value_usd - a.market_value_usd
  );
  const total = sorted.reduce((sum, h) => sum + h.market_value_usd, 0);
  if (total <= 0) return null;

  let acc = 0;
  const slices: Slice[] = sorted.map((h, i) => {
    const fraction = h.market_value_usd / total;
    const startAngle = acc * Math.PI * 2;
    acc += fraction;
    const endAngle = acc * Math.PI * 2;
    return {
      ticker: h.ticker,
      value: h.market_value_usd,
      color: SLICE_VARS[i % SLICE_VARS.length],
      startAngle,
      endAngle,
      fraction,
    };
  });

  // Pad the SVG viewport so out-of-arc labels (top/bottom slices) can
  // extend past the donut's outer radius without clipping.
  const labelPad = 32;
  const view = size + labelPad * 2;
  const cx = view / 2;
  const cy = view / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.32;
  const labelR = outerR + 14;

  return (
    <svg
      width={view}
      height={view}
      viewBox={`0 0 ${view} ${view}`}
      role="img"
      aria-label={`Portfolio allocation across ${holdings.length} positions`}
    >
      {slices.map((s) => (
        <path
          key={s.ticker}
          d={arcPath(cx, cy, innerR, outerR, s.startAngle, s.endAngle)}
          fill={s.color}
          stroke="var(--surface)"
          strokeWidth={1.5}
        >
          <title>{`${s.ticker} · ${(s.fraction * 100).toFixed(1)}%`}</title>
        </path>
      ))}
      {slices.map((s) => {
        // Hide labels under 5%. Below that the wedge is so thin that
        // an on-arc label overlaps the ring or its neighbour, and the
        // tooltip + the underlying allocation table already carry the
        // ticker → percentage mapping.
        if (s.fraction < 0.05) return null;
        const mid = (s.startAngle + s.endAngle) / 2;
        const x = cx + labelR * Math.sin(mid);
        const y = cy - labelR * Math.cos(mid);
        const anchor = x > cx + 1 ? "start" : x < cx - 1 ? "end" : "middle";
        return (
          <text
            key={`${s.ticker}-label`}
            x={x}
            y={y}
            fill="var(--ink)"
            fontSize={11}
            textAnchor={anchor}
            dominantBaseline="middle"
            style={{ fontFeatureSettings: '"tnum" 1' }}
          >
            {s.ticker}
          </text>
        );
      })}
    </svg>
  );
}

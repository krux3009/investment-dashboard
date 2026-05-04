import type { BenchmarkResponse, SeriesPoint } from "@/lib/api";

interface Props {
  data: BenchmarkResponse;
  width?: number;
  height?: number;
}

const W = 600;
const H = 200;
const PAD_X = 8;
const PAD_Y = 12;
const PAD_RIGHT = 56;

function pathFor(points: SeriesPoint[], minPct: number, range: number): string {
  if (points.length < 2) return "";
  const innerW = W - PAD_X - PAD_RIGHT;
  const innerH = H - PAD_Y * 2;
  const stepX = innerW / (points.length - 1);
  return points
    .map((p, i) => {
      const x = PAD_X + stepX * i;
      const y = PAD_Y + innerH - ((p.pct - minPct) / range) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function lastPoint(points: SeriesPoint[], minPct: number, range: number) {
  const innerW = W - PAD_X - PAD_RIGHT;
  const innerH = H - PAD_Y * 2;
  const stepX = innerW / (points.length - 1);
  const i = points.length - 1;
  return {
    x: PAD_X + stepX * i,
    y: PAD_Y + innerH - ((points[i].pct - minPct) / range) * innerH,
    pct: points[i].pct,
  };
}

export function BenchmarkChart({ data }: Props) {
  const allPcts = [
    ...data.portfolio.map((p) => p.pct),
    ...data.benchmarks.flatMap((b) => b.points.map((p) => p.pct)),
  ];
  if (allPcts.length === 0) {
    return (
      <div className="text-whisper text-sm italic h-[200px] flex items-center">
        no series
      </div>
    );
  }
  const min = Math.min(0, ...allPcts);
  const max = Math.max(0, ...allPcts);
  const padding = (max - min) * 0.05 || 0.01;
  const minPct = min - padding;
  const maxPct = max + padding;
  const range = maxPct - minPct || 1;

  const innerW = W - PAD_X - PAD_RIGHT;
  const innerH = H - PAD_Y * 2;
  const zeroY = PAD_Y + innerH - ((0 - minPct) / range) * innerH;

  const portfolioLast = lastPoint(data.portfolio, minPct, range);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={`Portfolio versus ${data.symbols.join(", ")} over ${data.days} days`}
      className="block"
    >
      <line
        x1={PAD_X}
        x2={W - PAD_RIGHT}
        y1={zeroY}
        y2={zeroY}
        stroke="var(--rule)"
        strokeWidth={0.75}
        strokeDasharray="2 4"
      />
      {data.benchmarks.map((b) => {
        const last = lastPoint(b.points, minPct, range);
        return (
          <g key={b.symbol}>
            <path
              d={pathFor(b.points, minPct, range)}
              fill="none"
              stroke="var(--quiet)"
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
            <text
              x={last.x + 6}
              y={last.y}
              fill="var(--quiet)"
              fontSize={11}
              dominantBaseline="middle"
            >
              {b.symbol} {(last.pct * 100).toFixed(1)}%
            </text>
          </g>
        );
      })}
      <path
        d={pathFor(data.portfolio, minPct, range)}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x={portfolioLast.x + 6}
        y={portfolioLast.y}
        fill="var(--ink)"
        fontSize={11}
        fontWeight={500}
        dominantBaseline="middle"
      >
        Portfolio {(portfolioLast.pct * 100).toFixed(1)}%
      </text>
    </svg>
  );
}

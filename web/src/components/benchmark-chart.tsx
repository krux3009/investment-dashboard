"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { BenchmarkResponse, SeriesPoint } from "@/lib/api";

interface Props {
  data: BenchmarkResponse;
  width?: number;
  height?: number;
  // Legend label for the portfolio line. Defaults to English; the client
  // caller (performance-chart-card) passes a translated value.
  portfolioLabel?: string;
}

const W = 600;
const H = 200;
const PAD_X = 8;
const PAD_Y = 12;
// Wide enough for the stacked two-line end label ("Portfolio" / "+12.0%")
// in both locales — a single-line label clipped at the viewBox edge.
const PAD_RIGHT = 84;

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
  const x = PAD_X + stepX * i;
  const y = PAD_Y + innerH - ((points[i].pct - minPct) / range) * innerH;
  return {
    x: +x.toFixed(4),
    y: +y.toFixed(4),
    pct: points[i].pct,
  };
}

const fmtPct = (pct: number) =>
  `${pct >= 0 ? "+" : "−"}${Math.abs(pct * 100).toFixed(1)}%`;

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function BenchmarkChart({ data, portfolioLabel = "Portfolio" }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Hovered/focused index into the portfolio series; null = no crosshair.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const allPcts = [
    ...data.portfolio.map((p) => p.pct),
    ...data.benchmarks.flatMap((b) => b.points.map((p) => p.pct)),
  ];

  // Benchmark values are joined to the crosshair by trade_date, not index —
  // series can have unequal lengths (a benchmark with a missing bar).
  const benchmarkByDate = useMemo(
    () =>
      data.benchmarks.map((b) => ({
        symbol: b.symbol,
        map: new Map(b.points.map((p) => [p.trade_date, p.pct])),
      })),
    [data.benchmarks],
  );

  const clearHover = useCallback(() => setHoverIdx(null), []);

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
  const zeroY = +(PAD_Y + innerH - ((0 - minPct) / range) * innerH).toFixed(4);

  const portfolioLast = lastPoint(data.portfolio, minPct, range);
  const n = data.portfolio.length;
  const stepX = n > 1 ? innerW / (n - 1) : innerW;

  const xFor = (i: number) => PAD_X + stepX * i;
  const yFor = (pct: number) =>
    PAD_Y + innerH - ((pct - minPct) / range) * innerH;

  // Pointer x (CSS px, svg scales with the card) → nearest portfolio index.
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || n < 2) return;
    const viewX = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((viewX - PAD_X) / stepX);
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (n < 2) return;
    const cur = hoverIdx ?? n - 1;
    if (e.key === "ArrowLeft") setHoverIdx(Math.max(0, cur - 1));
    else if (e.key === "ArrowRight") setHoverIdx(Math.min(n - 1, cur + 1));
    else if (e.key === "Home") setHoverIdx(0);
    else if (e.key === "End") setHoverIdx(n - 1);
    else if (e.key === "Escape") setHoverIdx(null);
    else return;
    e.preventDefault();
  };

  const hover =
    hoverIdx != null && data.portfolio[hoverIdx]
      ? {
          idx: hoverIdx,
          x: xFor(hoverIdx),
          date: data.portfolio[hoverIdx].trade_date,
          portfolioPct: data.portfolio[hoverIdx].pct,
          benchmarks: benchmarkByDate
            .map((b) => ({
              symbol: b.symbol,
              pct: b.map.get(data.portfolio[hoverIdx].trade_date),
            }))
            .filter((b): b is { symbol: string; pct: number } => b.pct != null),
        }
      : null;

  // Tooltip anchors to the crosshair; flips to the left past the midpoint so
  // it never clips at the card edge.
  const tooltipOnLeft = hover != null && hover.x > W / 2;

  return (
    <div ref={wrapperRef} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Portfolio versus ${data.symbols.join(", ")} over ${data.days} days`}
        className="block focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] rounded-sm"
        tabIndex={0}
        onPointerMove={onPointerMove}
        onPointerLeave={clearHover}
        onKeyDown={onKeyDown}
        onBlur={clearHover}
      >
        {/* Zero baseline — a solid hairline; dashing read as "projection". */}
        <line
          x1={PAD_X}
          x2={W - PAD_RIGHT}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--rule)"
          strokeWidth={1}
        />
        {data.benchmarks.map((b) => {
          const last = lastPoint(b.points, minPct, range);
          return (
            <g key={b.symbol}>
              <path
                d={pathFor(b.points, minPct, range)}
                fill="none"
                stroke="var(--quiet)"
                strokeWidth={1.25}
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
          stroke="var(--accent-primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* End marker: gold dot with a surface ring; the label wears the ink
            text token — identity comes from the dot, not colored text. */}
        <circle
          cx={portfolioLast.x}
          cy={portfolioLast.y}
          r={4}
          fill="var(--accent-primary)"
          stroke="var(--surface-raised)"
          strokeWidth={2}
        />
        <text
          x={portfolioLast.x + 8}
          y={portfolioLast.y - 6}
          fill="var(--ink)"
          fontSize={11}
          fontWeight={500}
          dominantBaseline="middle"
        >
          {portfolioLabel}
        </text>
        <text
          x={portfolioLast.x + 8}
          y={portfolioLast.y + 7}
          fill="var(--ink)"
          fontSize={11}
          fontWeight={500}
          dominantBaseline="middle"
        >
          {(portfolioLast.pct * 100).toFixed(1)}%
        </text>

        {/* Crosshair + hover markers */}
        {hover && (
          <g>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD_Y}
              y2={H - PAD_Y}
              stroke="var(--rule)"
              strokeWidth={1}
            />
            {hover.benchmarks.map((b) => (
              <circle
                key={b.symbol}
                cx={hover.x}
                cy={yFor(b.pct)}
                r={3.5}
                fill="var(--quiet)"
                stroke="var(--surface-raised)"
                strokeWidth={2}
              />
            ))}
            <circle
              cx={hover.x}
              cy={yFor(hover.portfolioPct)}
              r={4}
              fill="var(--accent-primary)"
              stroke="var(--surface-raised)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {/* Tooltip — HTML so type stays crisp at any card width. */}
      {hover && (
        <div
          className="absolute top-2 pointer-events-none rounded-md border border-rule bg-surface-raised px-3 py-2 text-xs shadow-none"
          style={
            tooltipOnLeft
              ? { right: `${100 - (hover.x / W) * 100}%`, marginRight: 8 }
              : { left: `${(hover.x / W) * 100}%`, marginLeft: 8 }
          }
        >
          <div className="text-whisper mb-1">{fmtDate(hover.date)}</div>
          <div className="flex items-center gap-1.5 tabular text-ink">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: "var(--accent-primary)" }}
            />
            {portfolioLabel} {fmtPct(hover.portfolioPct)}
          </div>
          {hover.benchmarks.map((b) => (
            <div key={b.symbol} className="flex items-center gap-1.5 tabular text-quiet">
              <span
                aria-hidden
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: "var(--quiet)" }}
              />
              {b.symbol} {fmtPct(b.pct)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

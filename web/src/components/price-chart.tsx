"use client";

import type { PricePoint } from "@/lib/api";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  points: PricePoint[];
  height?: number;
  // Net direction over the window. Drives the line color (paired with
  // arrows on the row already; the chart color reinforces, not signals).
  direction?: "gain" | "loss" | "quiet";
}

const STROKE_VAR = {
  gain: "var(--gain)",
  loss: "var(--loss)",
  quiet: "var(--quiet)",
} as const;

const fmtDateShort = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const fmtDateFull = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const fmtPrice = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PriceChart({ points, height = 220, direction = "quiet" }: Props) {
  if (!points || points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-quiet text-sm"
        style={{ height }}
      >
        no price data available
      </div>
    );
  }

  // Decide how many x-axis ticks to render — every ~12 points is plenty.
  const tickStep = Math.max(1, Math.floor(points.length / 6));
  const xTicks = points
    .filter((_, i) => i % tickStep === 0)
    .map((p) => p.date);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid
            stroke="var(--rule)"
            strokeDasharray="0"
            strokeOpacity={0.5}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            ticks={xTicks}
            tickFormatter={fmtDateShort}
            tick={{ fill: "var(--whisper)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--rule)" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtPrice}
            tick={{ fill: "var(--whisper)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            orientation="right"
          />
          <Tooltip
            cursor={{ stroke: "var(--rule)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--rule)",
              borderRadius: 0,
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              color: "var(--ink)",
            }}
            labelFormatter={(label) => fmtDateFull(String(label))}
            formatter={(value) => [fmtPrice(Number(value)), "close"]}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke={STROKE_VAR[direction]}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

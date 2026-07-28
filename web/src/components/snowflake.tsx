/**
 * Snowflake — SSR-safe hand-SVG pentagon mirroring SimplyWall.st's portfolio
 * + per-stock snowflake. Five axes scored 0-6 (or null = greyed).
 *
 * Sizes:
 *   - 28   mini (table-row column)
 *   - 96   strip (home hero, holdings row drill-in chip)
 *   - 240  card (Holdings tab Snowflake card, header strip on /stocks pages)
 *
 * Axis order (counter-clockwise from top, matching SWS):
 *   VALUE → FUTURE → PAST → HEALTH → DIVIDEND
 */

"use client";

import type { SVGProps } from "react";
import { useT } from "@/lib/i18n/use-t";
import type { StringKey } from "@/lib/i18n/strings";

export type SnowflakeScores = {
  valuation?: number | null;
  future?: number | null;
  past?: number | null;
  health?: number | null;
  dividends?: number | null;
};

export interface SnowflakeProps extends Omit<SVGProps<SVGSVGElement>, "viewBox"> {
  scores: SnowflakeScores;
  size?: 28 | 96 | 240;
  showLabels?: boolean;
  showRings?: boolean;
  variant?: "default" | "portfolio";
}

const VIEWBOX_W = 130;
const VIEWBOX_H = 120;
const CENTER_X = 65;
const CENTER_Y = 56;
const OUTER_RADIUS = 40;          // labels sit just outside, viewBox padded
const MAX_SCORE = 6;
const RING_COUNT = 6;

// Axis vertex angles (degrees, measured clockwise from straight up).
// Top → upper-right → lower-right → lower-left → upper-left.
const AXES = [
  { key: "valuation", label: "Value", angleDeg: 0 },
  { key: "future", label: "Future", angleDeg: 72 },
  { key: "past", label: "Past", angleDeg: 144 },
  { key: "health", label: "Health", angleDeg: 216 },
  { key: "dividends", label: "Dividend", angleDeg: 288 },
] as const;

type AxisKey = (typeof AXES)[number]["key"];

// Axis display labels reuse the drill-in axis keys so EN/ZH stay in one place.
const AXIS_LABEL_KEY: Record<AxisKey, StringKey> = {
  valuation: "drillin.axis.valuation",
  future: "drillin.axis.future",
  past: "drillin.axis.past",
  health: "drillin.axis.health",
  dividends: "drillin.axis.dividend",
};

// Convert (radius, angleDeg) → SVG (x, y) with y-axis flipped so 0° points up.
function point(radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER_X + radius * Math.sin(rad),
    y: CENTER_Y - radius * Math.cos(rad),
  };
}

function pentagonPath(radius: number): string {
  return AXES.map((axis, i) => {
    const { x, y } = point(radius, axis.angleDeg);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
}

export function Snowflake({
  scores,
  size = 96,
  showLabels,
  showRings,
  variant = "default",
  className,
  ...rest
}: SnowflakeProps) {
  const t = useT();
  const isMini = size === 28;
  // Sensible defaults: mini hides chrome; ≥96 shows it.
  const wantsLabels = showLabels ?? !isMini;
  const wantsRings = showRings ?? !isMini;

  // Resolve scores into clamped data points; null = greyed axis.
  const axisData = AXES.map((axis) => {
    const label = t(AXIS_LABEL_KEY[axis.key as AxisKey]);
    const raw = scores[axis.key as AxisKey];
    if (raw == null || Number.isNaN(raw)) return { ...axis, label, value: null as null };
    const clamped = Math.max(0, Math.min(MAX_SCORE, raw));
    return { ...axis, label, value: clamped };
  });

  const allNull = axisData.every((a) => a.value === null);

  // Data polygon (only over non-null vertices, using radius = value / MAX_SCORE * OUTER_RADIUS).
  // For visual continuity we still draw a polygon; null vertices collapse to center.
  const dataPoints = axisData.map((a) => {
    const r = a.value == null ? 0 : (a.value / MAX_SCORE) * OUTER_RADIUS;
    return point(r, a.angleDeg);
  });
  const dataPath = dataPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ") + " Z";

  // Mini variant uses a smaller stroke for crispness at 28px.
  const dataStroke = isMini ? 1 : 1.5;
  const ringStroke = isMini ? 0.4 : 0.5;
  const vertexR = isMini ? 1.2 : variant === "portfolio" ? 2.2 : 1.8;
  const labelFontSize = 6;
  const labelRadius = OUTER_RADIUS + 9;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      width={size}
      height={size}
      role="img"
      aria-label={t("chart.snowflake_aria", {
        axes: axisData
          .map((a) => `${a.label} ${a.value ?? "n/a"}/${MAX_SCORE}`)
          .join(", "),
      })}
      className={className}
      {...rest}
    >
      {/* Concentric grid rings */}
      {wantsRings &&
        Array.from({ length: RING_COUNT }, (_, i) => {
          const ringR = ((i + 1) / RING_COUNT) * OUTER_RADIUS;
          return (
            <path
              key={`ring-${i}`}
              d={pentagonPath(ringR)}
              fill="none"
              stroke="var(--rule)"
              strokeWidth={ringStroke}
              opacity={i === RING_COUNT - 1 ? 0.7 : 0.35}
            />
          );
        })}

      {/* Axis spokes — solid for scored axes, dashed for null. Coordinates
       *  pre-stringified to .toFixed(2) so SSR + client agree byte-for-byte
       *  (raw floats trigger React 19 hydration warnings on trig outputs). */}
      {wantsRings &&
        axisData.map((a) => {
          const { x, y } = point(OUTER_RADIUS, a.angleDeg);
          const isNull = a.value === null;
          return (
            <line
              key={`spoke-${a.key}`}
              x1={CENTER_X}
              y1={CENTER_Y}
              x2={x.toFixed(2)}
              y2={y.toFixed(2)}
              stroke="var(--rule)"
              strokeWidth={0.4}
              strokeDasharray={isNull ? "1.5 1.5" : undefined}
              opacity={isNull ? 0.5 : 0.4}
            />
          );
        })}

      {/* Ghost pentagon outline when all axes are null — communicates "scores
       *  pending" without leaving the cell visually empty (especially on the
       *  28px mini variant where rings + labels are suppressed). */}
      {allNull && (
        <path
          d={pentagonPath(OUTER_RADIUS)}
          fill="none"
          stroke="var(--quiet)"
          strokeWidth={isMini ? 1.2 : 0.8}
          strokeDasharray={isMini ? "2 1.5" : "1.5 1.5"}
          opacity={isMini ? 0.7 : 0.5}
          strokeLinejoin="round"
        />
      )}

      {/* Data polygon — gold fill + stroke. Suppressed if all axes null. */}
      {!allNull && (
        <path
          d={dataPath}
          fill="color-mix(in oklch, var(--accent-primary) 28%, transparent)"
          stroke="var(--accent-primary)"
          strokeWidth={dataStroke}
          strokeLinejoin="round"
        />
      )}

      {/* Vertex dots — only for non-null scores. */}
      {axisData.map((a) => {
        if (a.value === null) return null;
        const r = (a.value / MAX_SCORE) * OUTER_RADIUS;
        const { x, y } = point(r, a.angleDeg);
        return (
          <circle
            key={`vertex-${a.key}`}
            cx={x.toFixed(2)}
            cy={y.toFixed(2)}
            r={vertexR}
            fill="var(--accent-primary)"
          />
        );
      })}

      {/* Axis labels around the outside. */}
      {wantsLabels &&
        axisData.map((a) => {
          const { x, y } = point(labelRadius, a.angleDeg);
          const text = a.value === null ? `${a.label} —` : a.label;
          return (
            <text
              key={`label-${a.key}`}
              x={x.toFixed(2)}
              y={y.toFixed(2)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={labelFontSize}
              fill="var(--quiet)"
              style={{
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontFamily: "var(--font-sans)",
              }}
            >
              {text}
            </text>
          );
        })}
    </svg>
  );
}

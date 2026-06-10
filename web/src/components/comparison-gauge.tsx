/**
 * ComparisonGauge — horizontal scale bar with two markers (portfolio vs
 * market median). Mirrors SimplyWall.st's /portfolio Analysis tab Valuation
 * sub-tab cards (Price to Earnings · Price to Sales · Price to Expected
 * Growth · Future Cash Flow Value).
 *
 * Portfolio marker = gold (--accent-primary). Reference marker = quiet.
 * Scale starts at 0 and runs to scaleMax. Out-of-range values clamp to the
 * scale ends with a small "+" caret to indicate overflow.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ComparisonGaugeProps {
  title: ReactNode;
  portfolio: number;
  reference: number;
  scaleMax: number;
  scaleMin?: number;
  unit?: string;
  portfolioLabel?: ReactNode; // row label for the portfolio marker (default "portfolio")
  referenceLabel?: string;   // e.g. "US Market", "Tech sector"
  verdict?: {                // plain-English read of portfolio vs reference
    tone: "success" | "warn" | "neutral";
    label: string;          // chip text, e.g. "Much pricier than the market"
    meaning?: ReactNode;    // one-line explanation under the table
  };
  sub?: ReactNode;           // small caption below the table
  className?: string;
}

// Verdict chip tone → status color (18% tint bg + saturated text/border),
// matching statement-card.tsx and the insight action chip.
const VERDICT_CLASS = {
  success:
    "bg-[color-mix(in_oklch,var(--accent-success)_18%,transparent)] text-[var(--accent-success)] border-[var(--accent-success)]",
  warn: "bg-[color-mix(in_oklch,var(--accent-warn)_18%,transparent)] text-[var(--accent-warn)] border-[var(--accent-warn)]",
  neutral: "bg-transparent text-quiet border-rule",
} as const;

function formatValue(value: number, unit?: string): string {
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  return unit ? `${rounded}${unit}` : rounded;
}

export function ComparisonGauge({
  title,
  portfolio,
  reference,
  scaleMax,
  scaleMin = 0,
  unit = "",
  portfolioLabel = "portfolio",
  referenceLabel = "Market",
  verdict,
  sub,
  className,
}: ComparisonGaugeProps) {
  const range = scaleMax - scaleMin || 1;
  const clampPct = (v: number) => {
    const raw = ((v - scaleMin) / range) * 100;
    return Math.max(0, Math.min(100, raw));
  };
  const portfolioPct = clampPct(portfolio);
  const referencePct = clampPct(reference);
  const portfolioOver = portfolio > scaleMax;
  const portfolioUnder = portfolio < scaleMin;

  // Build x-axis ticks (0, max/4, max/2, 3max/4, max).
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => scaleMin + f * range);

  return (
    <div
      className={cn(
        "rounded-xl border border-rule bg-surface-raised p-5 flex flex-col gap-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-ink">{title}</h4>
        {verdict ? (
          <span
            className={cn(
              "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
              VERDICT_CLASS[verdict.tone],
            )}
          >
            {verdict.label}
          </span>
        ) : null}
      </div>

      <div className="relative h-9">
        {/* Scale bar */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[var(--surface-zebra)]" />
        {/* Tick labels */}
        <div className="absolute inset-x-0 top-0 flex justify-between text-[10px] text-quiet tabular">
          {ticks.map((t, i) => (
            <span key={i} className={cn(i === 0 && "ml-0", i === ticks.length - 1 && "mr-0")}>
              {formatValue(t, unit)}
            </span>
          ))}
        </div>
        {/* Reference marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-quiet"
          style={{ left: `${referencePct}%` }}
          aria-label={`${referenceLabel} ${formatValue(reference, unit)}`}
        />
        {/* Portfolio marker (gold dot + line) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
          style={{ left: `${portfolioPct}%`, transform: `translate(-50%, -50%)` }}
        >
          <div className="w-3 h-3 rounded-full bg-[var(--accent-primary)] border-2 border-surface-raised" />
        </div>
        {portfolioOver ? (
          <span className="absolute right-0 bottom-0 text-[10px] text-[var(--accent-primary)] tabular">+</span>
        ) : null}
        {portfolioUnder ? (
          <span className="absolute left-0 bottom-0 text-[10px] text-[var(--accent-primary)] tabular">−</span>
        ) : null}
      </div>

      <table className="w-full text-xs">
        <tbody>
          <tr>
            <td className="text-quiet py-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-primary)] mr-2 align-middle" />
              {portfolioLabel}
            </td>
            <td className="text-ink py-0.5 tabular text-right font-medium">
              {formatValue(portfolio, unit)}
            </td>
          </tr>
          <tr>
            <td className="text-quiet py-0.5">
              <span className="inline-block w-0.5 h-2.5 bg-quiet mr-2 align-middle" />
              {referenceLabel}
            </td>
            <td className="text-quiet py-0.5 tabular text-right">
              {formatValue(reference, unit)}
            </td>
          </tr>
        </tbody>
      </table>

      {verdict?.meaning ? (
        <p className="text-[11px] text-whisper leading-snug">{verdict.meaning}</p>
      ) : null}
      {sub ? <p className="text-[11px] text-quiet leading-snug">{sub}</p> : null}
    </div>
  );
}

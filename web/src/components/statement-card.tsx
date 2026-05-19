/**
 * StatementCard — SWS-style ✓ / ⚠ check used in per-stock drill-in 5-axis
 * grids and the /portfolio Analysis tab.
 *
 * Framing is relaxed compared to v3 Watch-line surfaces: judgement language
 * is allowed ("good value", "moderate debt", "strong cash position"), but
 * trading actions remain banned (buy/sell/hold/target/predict/recommend).
 * Server-side enforcement lives in src/api/analysts/_base.py
 * (FORBIDDEN_TRADING_ACTIONS subset, applied only to the snowflake
 * aggregator — see plan section H).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatementIcon = "check" | "warn" | "neutral";
export type StatementCategory = "valuation" | "future" | "past" | "health" | "dividend";

export interface StatementCardProps {
  icon: StatementIcon;
  category: StatementCategory;
  headline: ReactNode;
  sub?: ReactNode;
  className?: string;
}

const ICON_CLASS: Record<StatementIcon, string> = {
  check: "bg-[color-mix(in_oklch,var(--accent-success)_18%,transparent)] text-[var(--accent-success)] border-[var(--accent-success)]",
  warn: "bg-[color-mix(in_oklch,var(--accent-warn)_18%,transparent)] text-[var(--accent-warn)] border-[var(--accent-warn)]",
  neutral: "bg-transparent text-ink border-rule",
};

function IconGlyph({ icon }: { icon: StatementIcon }) {
  if (icon === "check") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    );
  }
  if (icon === "warn") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 4v5" />
        <circle cx="8" cy="12" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // neutral: hollow circle
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="8" cy="8" r="3" />
    </svg>
  );
}

export function StatementCard({
  icon,
  category,
  headline,
  sub,
  className,
}: StatementCardProps) {
  return (
    <div
      data-category={category}
      className={cn(
        "rounded-xl border border-rule bg-surface-raised p-4 flex gap-3 items-start",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border",
          ICON_CLASS[icon],
        )}
      >
        <IconGlyph icon={icon} />
      </span>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-medium text-ink leading-snug">{headline}</span>
        {sub ? <span className="text-xs text-quiet leading-snug">{sub}</span> : null}
      </div>
    </div>
  );
}

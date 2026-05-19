/**
 * KpiTile — single-metric card used in the Hero KPI strip + /portfolio
 * Holdings tab. Mirrors SimplyWall.st's four-tile row under the perf chart
 * (Unrealized · Realized · Dividends · Currency Impact).
 *
 * Numbers render in IBM Plex Mono with tabular figures so the column
 * widths stay aligned across rows.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type KpiTileSign = "pos" | "neg" | "flat";

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  delta?: {
    signed: string;       // "+US$201,505" or "-US$662"
    pct?: string;         // "91.4%"
    sign: KpiTileSign;
  };
  sub?: ReactNode;        // alternate small caption when no delta
  tone?: "default" | "muted";
  className?: string;
}

const SIGN_CLASS: Record<KpiTileSign, string> = {
  pos: "text-[var(--accent-success)]",
  neg: "text-[var(--accent-danger)]",
  flat: "text-quiet",
};

const SIGN_ARROW: Record<KpiTileSign, string> = {
  pos: "↑",
  neg: "↓",
  flat: "·",
};

export function KpiTile({ label, value, delta, sub, tone = "default", className }: KpiTileProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-rule p-4 flex flex-col gap-1",
        tone === "muted" ? "bg-surface" : "bg-surface-raised",
        className,
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-quiet">
        {label}
      </span>
      <span className="tabular text-2xl font-medium text-ink leading-tight">{value}</span>
      {delta ? (
        <span className={cn("tabular text-xs flex items-center gap-1.5", SIGN_CLASS[delta.sign])}>
          <span aria-hidden>{SIGN_ARROW[delta.sign]}</span>
          <span>{delta.signed}</span>
          {delta.pct ? <span className="text-quiet">{delta.pct}</span> : null}
        </span>
      ) : sub ? (
        <span className="text-xs text-quiet">{sub}</span>
      ) : null}
    </div>
  );
}

"use client";

// Shared interaction vocabulary for the two register surfaces
// (holdings-table + watchlist-table). Owns the expand/collapse state,
// the click + keyboard + aria contract of an expandable row/card, and
// the zebra/expanded background cascade — previously copied verbatim
// across four renderers.

import { useState } from "react";
import type { PricePoint } from "@/lib/api";

export function useExpandedCode() {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const toggle = (code: string) =>
    setExpandedCode((prev) => (prev === code ? null : code));
  return { expandedCode, toggle };
}

// Spreadable props making a <tr> / card div an accessible expand toggle.
export function expandableProps(
  code: string,
  isExpanded: boolean,
  onToggle: (code: string) => void,
) {
  return {
    onClick: () => onToggle(code),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle(code);
      }
    },
    tabIndex: 0,
    role: "button" as const,
    "aria-expanded": isExpanded,
  };
}

// Zebra tint via :nth-child(even). Expanded + hover states win in the
// cascade because their utility classes are emitted later than `even:`.
export function rowBgCls(isExpanded: boolean): string {
  return isExpanded
    ? "bg-surface-expanded"
    : "even:bg-surface-zebra hover:bg-surface-hover";
}

// Mobile card shell in the SWS vocabulary (raised, bordered, rounded-xl).
export function cardShellCls(isExpanded: boolean): string {
  return `rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
    isExpanded
      ? "bg-surface-expanded border-ink/30"
      : "bg-surface-raised border-rule hover:bg-surface-hover"
  }`;
}

export type TrendDirection = "gain" | "loss" | "quiet";

export function directionFor(value: number | null): TrendDirection {
  if (value === null || value === 0) return "quiet";
  return value > 0 ? "gain" : "loss";
}

// 30-day sparkline trend direction from first vs last close.
export function sparkDirectionFor(points: PricePoint[]): TrendDirection {
  if (points.length < 2) return "quiet";
  const first = points[0].close;
  const last = points[points.length - 1].close;
  if (last > first) return "gain";
  if (last < first) return "loss";
  return "quiet";
}

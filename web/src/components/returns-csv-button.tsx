"use client";

/**
 * Client-only download trigger for the Returns table. Generates a CSV
 * Blob client-side so we don't need a backend route. Quotes string
 * fields containing commas / quotes per RFC 4180.
 */

import type { ReturnsHolding } from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  rows: ReturnsHolding[];
  asOf: string;
  label?: string;
}

const HEADERS = [
  "code", "ticker", "name", "shares", "avg_price", "current_price",
  "value_usd", "cost_basis_usd", "unrealized_usd", "unrealized_pct",
  "dividends_ttm_usd", "total_gain_usd", "total_gain_pct",
] as const;

function csvCell(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(rows: ReturnsHolding[]): string {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(HEADERS.map((h) => csvCell(r[h] as string | number)).join(","));
  }
  return lines.join("\n");
}

export function ReturnsCsvButton({ rows, asOf, label }: Props) {
  const t = useT();
  function onClick() {
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `returns-${asOf}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs uppercase tracking-[0.06em] text-quiet hover:text-ink underline-offset-2 hover:underline"
    >
      {label ?? t("returns.download_csv")}
    </button>
  );
}

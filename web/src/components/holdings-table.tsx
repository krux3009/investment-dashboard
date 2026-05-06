"use client";

import type { EarningsItem, Holding, PriceHistory } from "@/lib/api";
import { arrowFor, directionClass, fmtCurrency, fmtPct, fmtUsd } from "@/lib/format";
import { useLiveHoldingsMap } from "@/lib/live-store";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DrillIn } from "./drill-in";
import { Sparkline } from "./sparkline";

const EARNINGS_SOON_DAYS = 14;

type SortKey = "ticker" | "qty" | "current_price" | "today_change_pct" | "market_value_usd" | "total_pnl_pct";
type SortDir = "asc" | "desc";

interface SortState {
  key: SortKey;
  dir: SortDir;
}

const STORAGE_KEY = "ql.holdings.sort";

function readSavedSort(): SortState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.key === "string" && (parsed.dir === "asc" || parsed.dir === "desc")) {
      return parsed as SortState;
    }
  } catch {}
  return null;
}

function compareHoldings(a: Holding, b: Holding, key: SortKey, dir: SortDir): number {
  let av: number | string;
  let bv: number | string;
  if (key === "ticker") {
    av = a.ticker;
    bv = b.ticker;
  } else {
    av = (a[key] ?? 0) as number;
    bv = (b[key] ?? 0) as number;
  }
  let cmp: number;
  if (typeof av === "string" && typeof bv === "string") {
    cmp = av.localeCompare(bv);
  } else {
    cmp = (av as number) - (bv as number);
  }
  return dir === "asc" ? cmp : -cmp;
}

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
  className?: string;
}

function SortableHeader({ label, sortKey, sort, onSort, className }: SortableHeaderProps) {
  const active = sort?.key === sortKey;
  const indicator = active ? (sort?.dir === "asc" ? "↑" : "↓") : "";
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`text-xs uppercase tracking-[0.04em] font-medium transition-colors hover:text-ink ${
        active ? "text-ink" : "text-whisper"
      } ${className ?? ""}`}
      aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {indicator && <span className="ml-1 text-quiet">{indicator}</span>}
    </button>
  );
}

interface Props {
  holdings: Holding[];
  // Map of code → 30-day price history, fetched server-side in page.tsx
  // for fast first paint. Missing keys render the sparkline empty state.
  sparklines: Record<string, PriceHistory>;
  // Map of code → next-earnings record. Tickers reporting within
  // EARNINGS_SOON_DAYS get a small calendar icon next to the name.
  earningsByCode: Record<string, EarningsItem>;
}

export function HoldingsTable({ holdings, sparklines, earningsByCode }: Props) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  // Restore saved sort on mount (client-only).
  useEffect(() => {
    setSort(readSavedSort());
  }, []);

  // Persist sort changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sort === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sort));
    }
  }, [sort]);

  // Live overlay: merge SSR holdings with the latest SSE tick by code.
  // The merge happens before sorting so sort columns like market_value_usd
  // reflect the current tick rather than the stale SSR value.
  const liveMap = useLiveHoldingsMap();
  const merged = useMemo(() => {
    if (liveMap.size === 0) return holdings;
    return holdings.map((h) => liveMap.get(h.code) ?? h);
  }, [holdings, liveMap]);

  const sorted = useMemo(() => {
    if (!sort) return merged;
    return [...merged].sort((a, b) => compareHoldings(a, b, sort.key, sort.dir));
  }, [merged, sort]);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null; // third click clears the sort
    });
  };

  const handleRowToggle = (code: string) => {
    setExpandedCode((prev) => (prev === code ? null : code));
  };

  if (holdings.length === 0) return null;

  return (
    <section>
      <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
        Holdings
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-rule">
            <th className="text-left pb-3 pr-4">
              <SortableHeader label="Position" sortKey="ticker" sort={sort} onSort={handleSort} />
            </th>
            <th className="text-right pb-3 px-4">
              <SortableHeader label="Qty" sortKey="qty" sort={sort} onSort={handleSort} className="text-right" />
            </th>
            <th className="text-right pb-3 px-4">
              <SortableHeader label="Price" sortKey="current_price" sort={sort} onSort={handleSort} className="text-right" />
            </th>
            <th className="text-right pb-3 px-4">
              <SortableHeader label="Today" sortKey="today_change_pct" sort={sort} onSort={handleSort} className="text-right" />
            </th>
            <th className="text-right pb-3 px-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">30d</span>
            </th>
            <th className="text-right pb-3 px-4">
              <SortableHeader label="Value (USD)" sortKey="market_value_usd" sort={sort} onSort={handleSort} className="text-right" />
            </th>
            <th className="text-right pb-3 pl-4">
              <SortableHeader label="Total return" sortKey="total_pnl_pct" sort={sort} onSort={handleSort} className="text-right" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => {
            const sparkData = sparklines[h.code]?.points ?? [];
            const sparkDirection: "gain" | "loss" | "quiet" =
              sparkData.length >= 2
                ? sparkData[sparkData.length - 1].close > sparkData[0].close
                  ? "gain"
                  : sparkData[sparkData.length - 1].close < sparkData[0].close
                  ? "loss"
                  : "quiet"
                : "quiet";
            const isExpanded = expandedCode === h.code;
            const isUsd = h.currency === "USD";

            return (
              <Fragment key={h.code}>
                <tr
                  className={`border-t border-rule cursor-pointer transition-colors ${
                    isExpanded ? "bg-surface-expanded" : "hover:bg-surface-hover"
                  }`}
                  onClick={() => handleRowToggle(h.code)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowToggle(h.code);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isExpanded}
                >
                  <td className="py-4 pr-4">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-medium text-ink">{h.ticker}</span>
                        {(() => {
                          const e = earningsByCode[h.code];
                          if (!e || e.days_until > EARNINGS_SOON_DAYS) return null;
                          const dateLabel = new Intl.DateTimeFormat("en-US", {
                            month: "long",
                            day: "numeric",
                          }).format(new Date(e.date));
                          const daysLabel =
                            e.days_until === 0
                              ? "today"
                              : `in ${e.days_until} day${e.days_until === 1 ? "" : "s"}`;
                          // Inline calendar SVG, currentColor for theme
                          // tracking. 12px, paired with the ticker via
                          // a tooltip (date + days-until) on hover.
                          return (
                            <span
                              title={`Earnings ${dateLabel} · ${daysLabel}`}
                              aria-label={`Earnings ${dateLabel} (${daysLabel})`}
                              className="text-quiet inline-flex items-center cursor-help"
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <rect x="2.5" y="3.5" width="11" height="10" rx="1" />
                                <line x1="2.5" y1="6.5" x2="13.5" y2="6.5" />
                                <line x1="5.5" y1="2" x2="5.5" y2="4.5" />
                                <line x1="10.5" y1="2" x2="10.5" y2="4.5" />
                              </svg>
                            </span>
                          );
                        })()}
                      </div>
                      <span className="text-xs text-quiet">
                        {h.name}{" "}
                        <span className="text-whisper">
                          · {h.market} · {h.currency}
                        </span>
                      </span>
                    </div>
                  </td>

                  <td className="py-4 px-4 text-right tabular text-ink">
                    {h.qty.toLocaleString()}
                  </td>

                  <td className="py-4 px-4 text-right tabular text-ink">
                    {fmtCurrency(h.current_price, h.currency, { decimals: 2 })}
                  </td>

                  <td className={`py-4 px-4 text-right tabular ${directionClass(h.today_change_pct)}`}>
                    {(() => {
                      // Both literal-zero pct AND zero abs is the
                      // off-hours / market-closed footprint (moomoo's
                      // position-side today_pl_val returns 0 outside
                      // RTH, quote overlay null-fell-through). Render a
                      // single em-dash placeholder rather than a
                      // misleading "0.0% / $0" that reads as "no
                      // movement today".
                      const noData =
                        (h.today_change_pct === 0 || h.today_change_pct === null) &&
                        (h.today_change_abs === 0 || h.today_change_abs === null);
                      if (noData) {
                        return <span className="text-whisper">—</span>;
                      }
                      return (
                        <>
                          <div className="flex items-baseline justify-end gap-1.5">
                            <span aria-hidden>{arrowFor(h.today_change_pct)}</span>
                            <span>{fmtPct(h.today_change_pct, 2)}</span>
                          </div>
                          {h.today_change_abs !== null && (
                            <div className="text-xs text-whisper">
                              {fmtCurrency(h.today_change_abs, h.currency, { decimals: 2, signed: true })}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </td>

                  <td className="py-4 px-4 text-right">
                    <div className="flex justify-end">
                      <Sparkline points={sparkData} direction={sparkDirection} />
                    </div>
                  </td>

                  <td className="py-4 px-4 text-right tabular">
                    <div className="text-ink">{fmtUsd(h.market_value_usd, { decimals: 2 })}</div>
                    {!isUsd && (
                      <div className="text-xs text-whisper">
                        {fmtCurrency(h.market_value, h.currency, { decimals: 2 })}
                      </div>
                    )}
                  </td>

                  <td className={`py-4 pl-4 text-right tabular ${directionClass(h.total_pnl_pct)}`}>
                    <div className="flex items-baseline justify-end gap-1.5">
                      <span aria-hidden>{arrowFor(h.total_pnl_pct)}</span>
                      <span>{fmtPct(h.total_pnl_pct, 2)}</span>
                    </div>
                    <div className="text-xs text-whisper">
                      {fmtUsd(h.total_pnl_abs_usd, { decimals: 2, signed: true })}
                    </div>
                  </td>
                </tr>

                {isExpanded && (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <DrillIn
                        code={h.code}
                        direction={
                          h.total_pnl_pct > 0
                            ? "gain"
                            : h.total_pnl_pct < 0
                            ? "loss"
                            : "quiet"
                        }
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

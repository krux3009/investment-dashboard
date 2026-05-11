"use client";

import type {
  EarningsItem,
  Holding,
  HoldingDividend,
  PriceHistory,
  PricePoint,
} from "@/lib/api";
import { arrowFor, directionClass, fmtCurrency, fmtPct, fmtUsd } from "@/lib/format";
import { useLiveHoldingsMap } from "@/lib/live-store";
import { useTickPulse } from "@/lib/use-tick-pulse";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DrillIn } from "./drill-in";
import { Sparkline } from "./sparkline";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";

const EARNINGS_SOON_DAYS = 14;
const EX_DIV_SOON_DAYS = 14;

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

interface HoldingRowProps {
  h: Holding;
  sparkData: PricePoint[];
  sparkDirection: "gain" | "loss" | "quiet";
  isExpanded: boolean;
  onToggle: (code: string) => void;
  earningsItem: EarningsItem | undefined;
  dividendSoon: HoldingDividend | undefined;
}

// Per-row pulse: when any field that the SSE tick mutates changes, the
// whole row tints once via .tick-pulse-cell on each <td>. Static fields
// (ticker, qty) are excluded so a no-op tick with identical prices does
// not pulse. <tr> backgrounds paint unreliably across browsers, so the
// existing per-cell CSS class is reused, gated on a single per-row bool.
function HoldingRow({
  h,
  sparkData,
  sparkDirection,
  isExpanded,
  onToggle,
  earningsItem,
  dividendSoon,
}: HoldingRowProps) {
  const t = useT();
  const { locale } = useLocale();
  const pulseHash = `${h.current_price}|${h.today_change_pct}|${h.market_value_usd}|${h.total_pnl_pct}`;
  const pulsing = useTickPulse(pulseHash);
  const pulseCls = pulsing ? "tick-pulse-cell" : "";
  const isUsd = h.currency === "USD";

  return (
    <Fragment>
      <tr
        className={`border-t border-rule cursor-pointer transition-colors ${
          isExpanded ? "bg-surface-expanded" : "hover:bg-surface-hover"
        }`}
        onClick={() => onToggle(h.code)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(h.code);
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
                const e = earningsItem;
                if (!e || e.days_until > EARNINGS_SOON_DAYS) return null;
                const dateLabel = new Intl.DateTimeFormat(
                  locale === "zh" ? "zh-CN" : "en-US",
                  { month: "long", day: "numeric" },
                ).format(new Date(e.date));
                const daysLabel =
                  e.days_until === 0
                    ? t("holdings.earnings.today")
                    : t(
                        e.days_until === 1
                          ? "holdings.earnings.in_day"
                          : "holdings.earnings.in_days",
                        { n: e.days_until },
                      );
                return (
                  <span
                    title={t("holdings.earnings.title", {
                      date: dateLabel,
                      label: daysLabel,
                    })}
                    aria-label={t("holdings.earnings.aria", {
                      date: dateLabel,
                      label: daysLabel,
                    })}
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
              {(() => {
                if (!dividendSoon || !dividendSoon.next_ex_date) return null;
                const ex = new Date(dividendSoon.next_ex_date);
                const today = new Date();
                const daysUntil = Math.ceil(
                  (ex.getTime() - today.getTime()) / 86_400_000,
                );
                if (daysUntil < 0 || daysUntil > EX_DIV_SOON_DAYS) return null;
                const dateLabel = new Intl.DateTimeFormat(
                  locale === "zh" ? "zh-CN" : "en-US",
                  { month: "long", day: "numeric" },
                ).format(ex);
                const daysLabel =
                  daysUntil === 0
                    ? t("dividends.exdiv.today")
                    : t(
                        daysUntil === 1
                          ? "dividends.exdiv.in_day"
                          : "dividends.exdiv.in_days",
                        { n: daysUntil },
                      );
                return (
                  <span
                    title={t("dividends.exdiv.title", {
                      date: dateLabel,
                      label: daysLabel,
                    })}
                    aria-label={t("dividends.exdiv.aria", {
                      date: dateLabel,
                      label: daysLabel,
                    })}
                    className="text-quiet inline-flex items-center cursor-help font-serif italic text-sm leading-none"
                  >
                    ƒ
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
          <div className={pulseCls}>{h.qty.toLocaleString()}</div>
        </td>

        <td className="py-4 px-4 text-right tabular text-ink">
          <div className={pulseCls}>
            {fmtCurrency(h.current_price, h.currency, { decimals: 2 })}
          </div>
        </td>

        <td className={`py-4 px-4 text-right tabular ${directionClass(h.today_change_pct)}`}>
          {(() => {
            const noData =
              (h.today_change_pct === 0 || h.today_change_pct === null) &&
              (h.today_change_abs === 0 || h.today_change_abs === null);
            if (noData) {
              return <span className="text-whisper">—</span>;
            }
            return (
              <div className={pulseCls}>
                <div className="flex items-baseline justify-end gap-1.5">
                  <span aria-hidden>{arrowFor(h.today_change_pct)}</span>
                  <span>{fmtPct(h.today_change_pct, 2)}</span>
                </div>
                {h.today_change_abs !== null && (
                  <div className="text-xs text-whisper">
                    {fmtCurrency(h.today_change_abs, h.currency, { decimals: 2, signed: true })}
                  </div>
                )}
              </div>
            );
          })()}
        </td>

        <td className="py-4 px-4 text-right">
          <div className="flex justify-end">
            <Sparkline points={sparkData} direction={sparkDirection} />
          </div>
        </td>

        <td className="py-4 px-4 text-right tabular">
          <div className={pulseCls}>
            <div className="text-ink">{fmtUsd(h.market_value_usd, { decimals: 2 })}</div>
            {!isUsd && (
              <div className="text-xs text-whisper">
                {fmtCurrency(h.market_value, h.currency, { decimals: 2 })}
              </div>
            )}
          </div>
        </td>

        <td className={`py-4 pl-4 text-right tabular ${directionClass(h.total_pnl_pct)}`}>
          <div className={pulseCls}>
            <div className="flex items-baseline justify-end gap-1.5">
              <span aria-hidden>{arrowFor(h.total_pnl_pct)}</span>
              <span>{fmtPct(h.total_pnl_pct, 2)}</span>
            </div>
            <div className="text-xs text-whisper">
              {fmtUsd(h.total_pnl_abs_usd, { decimals: 2, signed: true })}
            </div>
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
}

interface Props {
  holdings: Holding[];
  // Map of code → 30-day price history, fetched server-side in page.tsx
  // for fast first paint. Missing keys render the sparkline empty state.
  sparklines: Record<string, PriceHistory>;
  // Map of code → next-earnings record. Tickers reporting within
  // EARNINGS_SOON_DAYS get a small calendar icon next to the name.
  earningsByCode: Record<string, EarningsItem>;
  // Map of code → upcoming dividend record. Tickers with an ex-date
  // within EX_DIV_SOON_DAYS get a small ƒ glyph next to the name.
  dividendsByCode?: Record<string, HoldingDividend>;
}

export function HoldingsTable({
  holdings,
  sparklines,
  earningsByCode,
  dividendsByCode = {},
}: Props) {
  const t = useT();
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
        {t("holdings.heading")}
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-rule">
            <th className="text-left pb-3 pr-4">
              <SortableHeader label={t("holdings.col.position")} sortKey="ticker" sort={sort} onSort={handleSort} />
            </th>
            <th className="text-right pb-3 px-4">
              <SortableHeader label={t("holdings.col.qty")} sortKey="qty" sort={sort} onSort={handleSort} className="text-right" />
            </th>
            <th className="text-right pb-3 px-4">
              <SortableHeader label={t("holdings.col.price")} sortKey="current_price" sort={sort} onSort={handleSort} className="text-right" />
            </th>
            <th className="text-right pb-3 px-4">
              <SortableHeader label={t("holdings.col.today")} sortKey="today_change_pct" sort={sort} onSort={handleSort} className="text-right" />
            </th>
            <th className="text-right pb-3 px-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">{t("holdings.col.30d")}</span>
            </th>
            <th className="text-right pb-3 px-4">
              <SortableHeader label={t("holdings.col.value_usd")} sortKey="market_value_usd" sort={sort} onSort={handleSort} className="text-right" />
            </th>
            <th className="text-right pb-3 pl-4">
              <SortableHeader label={t("holdings.col.total_return")} sortKey="total_pnl_pct" sort={sort} onSort={handleSort} className="text-right" />
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
            return (
              <HoldingRow
                key={h.code}
                h={h}
                sparkData={sparkData}
                sparkDirection={sparkDirection}
                isExpanded={expandedCode === h.code}
                onToggle={handleRowToggle}
                earningsItem={earningsByCode[h.code]}
                dividendSoon={dividendsByCode[h.code]}
              />
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

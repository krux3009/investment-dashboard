"use client";

import type {
  EarningsItem,
  Holding,
  HoldingDividend,
  PriceHistory,
  PricePoint,
} from "@/lib/api";
import { arrowFor, directionClass, fmtCurrency, fmtPct, fmtUsd } from "@/lib/format";
import { holdingPulseHash, useLiveHoldingsMap } from "@/lib/live-store";
import { useTickPulse } from "@/lib/use-tick-pulse";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DrillIn } from "./drill-in";
import {
  cardShellCls,
  directionFor,
  expandableProps,
  rowBgCls,
  sparkDirectionFor,
  useExpandedCode,
} from "./register-shared";
import { Sparkline } from "./sparkline";
import { Snowflake, type SnowflakeScores } from "./snowflake";
import { useT } from "@/lib/i18n/use-t";
import { intlLocale, useLocale } from "@/lib/i18n/locale-provider";
import type { StringKey } from "@/lib/i18n/strings";

const EARNINGS_SOON_DAYS = 14;
const EX_DIV_SOON_DAYS = 14;

// Earnings glyph (small calendar icon) rendered when the holding reports
// within EARNINGS_SOON_DAYS. Shared by the desktop row + the mobile card.
function EarningsGlyph({ item }: { item: EarningsItem | undefined }) {
  const t = useT();
  const { locale } = useLocale();
  if (!item || item.days_until > EARNINGS_SOON_DAYS) return null;
  const dateLabel = new Intl.DateTimeFormat(
    intlLocale(locale),
    { month: "long", day: "numeric" },
  ).format(new Date(item.date));
  const daysLabel =
    item.days_until === 0
      ? t("holdings.earnings.today")
      : t(
          item.days_until === 1
            ? "holdings.earnings.in_day"
            : "holdings.earnings.in_days",
          { n: item.days_until },
        );
  return (
    <span
      title={t("holdings.earnings.title", { date: dateLabel, label: daysLabel })}
      aria-label={t("holdings.earnings.aria", { date: dateLabel, label: daysLabel })}
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
}

// Ex-dividend glyph (ƒ in serif italic) rendered when next_ex_date falls
// within EX_DIV_SOON_DAYS. Shared by the desktop row + the mobile card.
function DividendGlyph({ dividend }: { dividend: HoldingDividend | undefined }) {
  const t = useT();
  const { locale } = useLocale();
  if (!dividend || !dividend.next_ex_date) return null;
  const ex = new Date(dividend.next_ex_date);
  const today = new Date();
  const daysUntil = Math.ceil((ex.getTime() - today.getTime()) / 86_400_000);
  if (daysUntil < 0 || daysUntil > EX_DIV_SOON_DAYS) return null;
  const dateLabel = new Intl.DateTimeFormat(
    intlLocale(locale),
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
      title={t("dividends.exdiv.title", { date: dateLabel, label: daysLabel })}
      aria-label={t("dividends.exdiv.aria", { date: dateLabel, label: daysLabel })}
      className="text-quiet inline-flex items-center cursor-help font-serif italic text-sm leading-none"
    >
      ƒ
    </span>
  );
}

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
  snowflakeScores?: SnowflakeScores;
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
  snowflakeScores,
}: HoldingRowProps) {
  const pulsing = useTickPulse(holdingPulseHash(h));
  const pulseCls = pulsing ? "tick-pulse-cell" : "";
  const isUsd = h.currency === "USD";

  return (
    <Fragment>
      <tr
        className={`border-b border-rule cursor-pointer transition-colors ${rowBgCls(isExpanded)}`}
        {...expandableProps(h.code, isExpanded, onToggle)}
      >
        {/* Glyph margin column — register left margin. Always present
            so the row's left edge reads as structural, even when no
            glyph applies. Earnings glyph wins if both are present. */}
        <td className="py-3 pl-1 pr-2 align-top w-6">
          <div className="flex flex-col items-center gap-1 pt-1">
            <EarningsGlyph item={earningsItem} />
            <DividendGlyph dividend={dividendSoon} />
          </div>
        </td>

        <td className="py-3 pr-4 align-top">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-medium text-ink leading-tight">
              {h.ticker}
            </span>
            <span className="text-xs text-quiet">
              {h.name}{" "}
              <span className="text-whisper">
                · {h.market} · {h.currency}
              </span>
            </span>
          </div>
        </td>

        <td className="py-3 px-4 text-right tabular text-ink font-medium align-top">
          <div className={pulseCls}>{h.qty.toLocaleString()}</div>
        </td>

        <td className="py-3 px-4 text-right tabular text-ink font-medium align-top">
          <div className={pulseCls}>
            {fmtCurrency(h.current_price, h.currency, { decimals: 2 })}
          </div>
        </td>

        <td className={`py-3 px-4 text-right tabular font-medium align-top ${directionClass(h.today_change_pct)}`}>
          {(() => {
            const noData =
              (h.today_change_pct === 0 || h.today_change_pct === null) &&
              (h.today_change_abs === 0 || h.today_change_abs === null);
            if (noData) {
              return <span className="text-whisper font-normal">—</span>;
            }
            return (
              <div className={pulseCls}>
                <div className="flex items-baseline justify-end gap-1.5">
                  <span aria-hidden>{arrowFor(h.today_change_pct)}</span>
                  <span>{fmtPct(h.today_change_pct, 2)}</span>
                </div>
                {h.today_change_abs !== null && (
                  <div className="text-xs text-whisper font-normal">
                    {fmtCurrency(h.today_change_abs, h.currency, { decimals: 2, signed: true })}
                  </div>
                )}
              </div>
            );
          })()}
        </td>

        <td className="py-3 px-4 text-right align-top">
          <div className="flex justify-end pt-1">
            <Sparkline points={sparkData} direction={sparkDirection} />
          </div>
        </td>

        <td className="py-3 px-3 text-center align-top">
          <div className="flex justify-center pt-1">
            <Snowflake
              size={28}
              scores={snowflakeScores ?? {}}
              showLabels={false}
              showRings={false}
            />
          </div>
        </td>

        <td className="py-3 px-4 text-right tabular align-top">
          <div className={pulseCls}>
            <div className="text-ink font-medium">
              {fmtUsd(h.market_value_usd, { decimals: 2 })}
            </div>
            {!isUsd && (
              <div className="text-xs text-whisper font-normal">
                {fmtCurrency(h.market_value, h.currency, { decimals: 2 })}
              </div>
            )}
          </div>
        </td>

        <td className={`py-3 pl-4 text-right tabular font-medium align-top ${directionClass(h.total_pnl_pct)}`}>
          <div className={pulseCls}>
            <div className="flex items-baseline justify-end gap-1.5">
              <span aria-hidden>{arrowFor(h.total_pnl_pct)}</span>
              <span>{fmtPct(h.total_pnl_pct, 2)}</span>
            </div>
            <div className="text-xs text-whisper font-normal">
              {fmtUsd(h.total_pnl_abs_usd, { decimals: 2, signed: true })}
            </div>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={9} className="p-0">
            <DrillIn code={h.code} direction={directionFor(h.total_pnl_pct)} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// Mobile (below md) stacked-card form of one holding. Same data + tap-to-
// expand drill-in as HoldingRow, reshaped into the SWS card vocabulary
// (bg-surface-raised border rounded-xl). The whole card is the tap target.
// Card face: market value USD (primary) + total-return % + today % on the
// right; ticker/name/market·ccy + sparkline + glyphs on the left.
function HoldingCard({
  h,
  sparkData,
  sparkDirection,
  isExpanded,
  onToggle,
  earningsItem,
  dividendSoon,
  snowflakeScores,
}: HoldingRowProps) {
  const t = useT();
  const pulsing = useTickPulse(holdingPulseHash(h));
  const pulseCls = pulsing ? "tick-pulse-cell" : "";
  const isUsd = h.currency === "USD";
  const noToday =
    (h.today_change_pct === 0 || h.today_change_pct === null) &&
    (h.today_change_abs === 0 || h.today_change_abs === null);

  return (
    <div>
      <div
        className={cardShellCls(isExpanded)}
        {...expandableProps(h.code, isExpanded, onToggle)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-base font-medium text-ink leading-tight">
              {h.ticker}
            </span>
            <span className="text-xs text-quiet truncate">{h.name}</span>
            <span className="text-xs text-whisper">
              {h.market} · {h.currency}
            </span>
          </div>

          <div className={`flex flex-col items-end gap-0.5 tabular shrink-0 ${pulseCls}`}>
            <div className="text-ink font-medium">
              {fmtUsd(h.market_value_usd, { decimals: 2 })}
            </div>
            {!isUsd && (
              <div className="text-xs text-whisper font-normal">
                {fmtCurrency(h.market_value, h.currency, { decimals: 2 })}
              </div>
            )}
            <div className={`flex items-baseline gap-1 text-sm font-medium ${directionClass(h.total_pnl_pct)}`}>
              <span aria-hidden>{arrowFor(h.total_pnl_pct)}</span>
              <span>{fmtPct(h.total_pnl_pct, 2)}</span>
              <span className="text-xs text-whisper font-normal">
                {t("holdings.card.total")}
              </span>
            </div>
            {noToday ? (
              <div className="text-xs text-whisper font-normal">
                — {t("holdings.card.today")}
              </div>
            ) : (
              <div className={`flex items-baseline gap-1 text-sm font-medium ${directionClass(h.today_change_pct)}`}>
                <span aria-hidden>{arrowFor(h.today_change_pct)}</span>
                <span>{fmtPct(h.today_change_pct, 2)}</span>
                <span className="text-xs text-whisper font-normal">
                  {t("holdings.card.today")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <Sparkline points={sparkData} direction={sparkDirection} />
          <Snowflake size={28} scores={snowflakeScores ?? {}} showLabels={false} showRings={false} />
          <div className="flex items-center gap-2 ml-auto">
            <EarningsGlyph item={earningsItem} />
            <DividendGlyph dividend={dividendSoon} />
          </div>
        </div>
      </div>

      {isExpanded && (
        <DrillIn code={h.code} direction={directionFor(h.total_pnl_pct)} />
      )}
    </div>
  );
}

// Mobile sort control — replaces the column-header sorting that vanishes
// when the table becomes cards. Horizontally scrollable pill row driving
// the same handleSort / localStorage sort state as the desktop headers.
const MOBILE_SORT_PILLS: { key: SortKey; labelKey: StringKey }[] = [
  { key: "ticker", labelKey: "holdings.sort.ticker" },
  { key: "market_value_usd", labelKey: "holdings.sort.value" },
  { key: "today_change_pct", labelKey: "holdings.col.today" },
  { key: "total_pnl_pct", labelKey: "holdings.sort.total" },
];

function MobileSortControl({
  sort,
  onSort,
}: {
  sort: SortState | null;
  onSort: (key: SortKey) => void;
}) {
  const t = useT();
  return (
    <div className="md:hidden mb-3 -mx-1 overflow-x-auto">
      <div className="flex items-center gap-1.5 px-1 min-w-max">
        <span className="text-xs uppercase tracking-[0.04em] text-whisper pr-1 shrink-0">
          {t("holdings.sort.label")}
        </span>
        {MOBILE_SORT_PILLS.map((p) => {
          const active = sort?.key === p.key;
          const arrow = active ? (sort?.dir === "asc" ? "↑" : "↓") : "";
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onSort(p.key)}
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs transition-colors ${
                active
                  ? "border-ink text-ink bg-surface-hover font-medium"
                  : "border-rule text-quiet"
              }`}
            >
              {t(p.labelKey)}
              {arrow && <span className="ml-1 text-quiet">{arrow}</span>}
            </button>
          );
        })}
      </div>
    </div>
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
  // Map of code → snowflake scores. Missing keys render a greyed mini.
  // Wired in P5 via /api/snowflake/{code}.
  snowflakeScoresByCode?: Record<string, SnowflakeScores>;
}

export function HoldingsTable({
  holdings,
  sparklines,
  earningsByCode,
  dividendsByCode = {},
  snowflakeScoresByCode = {},
}: Props) {
  const t = useT();
  const [sort, setSort] = useState<SortState | null>(null);
  const { expandedCode, toggle: handleRowToggle } = useExpandedCode();

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

  if (holdings.length === 0) return null;

  return (
    <section>
      <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
        {t("holdings.heading")}
      </div>

      {/* Mobile (below md): sort pills + stacked cards. */}
      <MobileSortControl sort={sort} onSort={handleSort} />
      <div className="md:hidden flex flex-col gap-2">
        {sorted.map((h) => {
          const sparkData = sparklines[h.code]?.points ?? [];
          return (
            <HoldingCard
              key={h.code}
              h={h}
              sparkData={sparkData}
              sparkDirection={sparkDirectionFor(sparkData)}
              isExpanded={expandedCode === h.code}
              onToggle={handleRowToggle}
              earningsItem={earningsByCode[h.code]}
              dividendSoon={dividendsByCode[h.code]}
              snowflakeScores={snowflakeScoresByCode[h.code]}
            />
          );
        })}
      </div>

      {/* Desktop (md+): the register table. Wrapped so it scrolls inside
          its own box at tablet widths instead of pushing the page. */}
      <div className="hidden md:block overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-rule">
            {/* Glyph margin column header — empty but reserved so the
                register's left margin remains a structural element. */}
            <th aria-hidden className="pb-3 w-6" />
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
            <th className="text-center pb-3 px-3">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">{t("holdings.col.snow")}</span>
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
            return (
              <HoldingRow
                key={h.code}
                h={h}
                sparkData={sparkData}
                sparkDirection={sparkDirectionFor(sparkData)}
                isExpanded={expandedCode === h.code}
                onToggle={handleRowToggle}
                earningsItem={earningsByCode[h.code]}
                dividendSoon={dividendsByCode[h.code]}
                snowflakeScores={snowflakeScoresByCode[h.code]}
              />
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
  );
}

"use client";

import type { PriceHistory, PricePoint, Quote } from "@/lib/api";
import { arrowFor, directionClass, fmtPct } from "@/lib/format";
import { useLiveWatchlistMap, type LiveWatchlistQuote } from "@/lib/live-store";
import { useTickPulse } from "@/lib/use-tick-pulse";
import { Fragment, useState } from "react";
import { DrillIn } from "./drill-in";
import { Sparkline } from "./sparkline";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  codes: string[];
  // Map of code → 30-day price history, fetched server-side. Codes
  // missing from the map render as quiet placeholder rows.
  sparklines: Record<string, PriceHistory>;
  // Map of code → live moomoo snapshot for today's intraday move.
  // Empty map (or missing code) collapses the Today column to "–".
  quotes?: Record<string, Quote>;
}

const tickerFromCode = (code: string) =>
  code.includes(".") ? code.split(".")[1] : code;
const marketFromCode = (code: string) =>
  code.includes(".") ? code.split(".")[0] : "?";

interface WatchlistRowProps {
  code: string;
  points: PricePoint[];
  quote: Quote | undefined;
  liveQuote: LiveWatchlistQuote | undefined;
  isExpanded: boolean;
  onToggle: (code: string) => void;
}

// Per-row pulse: hashes the live-tick fields the SSE stream mutates
// (last_price + today_change_pct). Same approach as HoldingsTable —
// .tick-pulse-cell on each <td>'s inner wrapper, gated by one bool.
function WatchlistRow({
  code,
  points,
  quote,
  liveQuote,
  isExpanded,
  onToggle,
}: WatchlistRowProps) {
  const ticker = tickerFromCode(code);
  const market = marketFromCode(code);
  const has = points.length >= 2;
  const sparkLast = has ? points[points.length - 1].close : null;
  const first = has ? points[0].close : null;
  const change30 =
    has && first && first !== 0 ? (sparkLast! - first) / first : null;
  const direction: "gain" | "loss" | "quiet" =
    change30 === null ? "quiet" : change30 > 0 ? "gain" : change30 < 0 ? "loss" : "quiet";

  const last =
    liveQuote?.last_price ?? quote?.last_price ?? sparkLast;
  const today =
    liveQuote?.today_change_pct ?? quote?.today_change_pct ?? null;

  const pulseHash = `${last ?? ""}|${today ?? ""}`;
  const pulsing = useTickPulse(pulseHash);
  const pulseCls = pulsing ? "tick-pulse-cell" : "";

  // Zebra cascade mirrors holdings-table: expanded overrides; otherwise
  // even rows tint, hover darkens further. Hover + expanded utilities
  // emit later than `even:` so the cascade resolves correctly.
  const rowBgCls = isExpanded
    ? "bg-surface-expanded"
    : "even:bg-surface-zebra hover:bg-surface-hover";

  return (
    <Fragment>
      <tr
        className={`border-b border-rule cursor-pointer transition-colors ${rowBgCls}`}
        onClick={() => onToggle(code)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(code);
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
      >
        {/* Glyph margin column — reserved for future earnings/ex-div marks
            once /api/watchlist carries those dates. Keeps watchlist rows
            aligned with the holdings register's left edge. */}
        <td className="py-3 pl-1 pr-2 align-top w-6">
          <div className="flex flex-col items-center gap-1 pt-1" />
        </td>

        <td className="py-3 pr-4">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-medium text-ink">{ticker}</span>
            <span className="text-xs text-whisper uppercase tracking-wider">
              {market}
            </span>
          </div>
        </td>

        <td className="py-3 px-4 text-right tabular font-medium text-ink">
          <div className={pulseCls}>
            {last === null
              ? "–"
              : `$${last.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
          </div>
        </td>

        <td className={`py-3 px-4 text-right tabular font-medium ${directionClass(today)}`}>
          {today === null || today === 0 ? (
            <span className="text-whisper font-normal">—</span>
          ) : (
            <div className={`flex items-baseline justify-end gap-1.5 ${pulseCls}`}>
              <span aria-hidden>{arrowFor(today)}</span>
              <span>{fmtPct(today, 2)}</span>
            </div>
          )}
        </td>

        <td className={`py-3 px-4 text-right tabular font-medium ${directionClass(change30)}`}>
          <div className="flex items-baseline justify-end gap-1.5">
            <span aria-hidden>{arrowFor(change30)}</span>
            <span>{fmtPct(change30, 1)}</span>
          </div>
        </td>

        <td className="py-3 pl-4">
          <div className="flex justify-end">
            <Sparkline points={points} direction={direction} />
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={6} className="p-0">
            <DrillIn code={code} direction={direction} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function WatchlistTable({ codes, sparklines, quotes = {} }: Props) {
  const t = useT();
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const liveMap = useLiveWatchlistMap();

  if (codes.length === 0) return null;

  const toggle = (code: string) =>
    setExpandedCode((prev) => (prev === code ? null : code));

  return (
    <section className="mt-16">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.06em] text-quiet">
          {t("watchlist.heading")}
        </div>
        <div className="text-xs text-whisper tabular">
          {t("watchlist.symbol_count", { n: codes.length })}
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-rule">
            {/* Glyph margin header — empty + aria-hidden; mirrors the
                holdings register's reserved left column. */}
            <th aria-hidden className="pb-3 w-6" />
            <th className="text-left pb-3 pr-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                {t("watchlist.col.position")}
              </span>
            </th>
            <th className="text-right pb-3 px-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                {t("watchlist.col.last")}
              </span>
            </th>
            <th className="text-right pb-3 px-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                {t("watchlist.col.today")}
              </span>
            </th>
            <th className="text-right pb-3 px-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                {t("watchlist.col.30d")}
              </span>
            </th>
            <th className="text-right pb-3 pl-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                {t("watchlist.col.trend")}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {codes.map((code) => (
            <WatchlistRow
              key={code}
              code={code}
              points={sparklines[code]?.points ?? []}
              quote={quotes[code]}
              liveQuote={liveMap.get(code)}
              isExpanded={expandedCode === code}
              onToggle={toggle}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

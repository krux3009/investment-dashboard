"use client";

import type { PriceHistory, PricePoint, Quote } from "@/lib/api";
import { arrowFor, directionClass, fmtPct } from "@/lib/format";
import { useLiveWatchlistMap, type LiveWatchlistQuote } from "@/lib/live-store";
import { useTickPulse } from "@/lib/use-tick-pulse";
import { Fragment, useState } from "react";
import { DrillIn } from "./drill-in";
import { Sparkline } from "./sparkline";
import { Snowflake, type SnowflakeScores } from "./snowflake";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  codes: string[];
  // Map of code → 30-day price history, fetched server-side. Codes
  // missing from the map render as quiet placeholder rows.
  sparklines: Record<string, PriceHistory>;
  // Map of code → live moomoo snapshot for today's intraday move.
  // Empty map (or missing code) collapses the Today column to "–".
  quotes?: Record<string, Quote>;
  // Map of code → snowflake scores. Wired in P5 via /api/snowflake/{code}.
  // Missing keys render a greyed ghost-pentagon mini.
  snowflakeScoresByCode?: Record<string, SnowflakeScores>;
}

const tickerFromCode = (code: string) =>
  code.includes(".") ? code.split(".")[1] : code;
const marketFromCode = (code: string) =>
  code.includes(".") ? code.split(".")[0] : "?";

// Shared derivation for the desktop row + the mobile card: resolves the
// ticker/market labels, 30-day trend, and the live-or-snapshot last/today
// values from the same precedence (live tick > snapshot quote > sparkline).
function deriveWatchlistRow(
  code: string,
  points: PricePoint[],
  quote: Quote | undefined,
  liveQuote: LiveWatchlistQuote | undefined,
) {
  const has = points.length >= 2;
  const sparkLast = has ? points[points.length - 1].close : null;
  const first = has ? points[0].close : null;
  const change30 =
    has && first && first !== 0 ? (sparkLast! - first) / first : null;
  const direction: "gain" | "loss" | "quiet" =
    change30 === null ? "quiet" : change30 > 0 ? "gain" : change30 < 0 ? "loss" : "quiet";
  const last = liveQuote?.last_price ?? quote?.last_price ?? sparkLast;
  const today = liveQuote?.today_change_pct ?? quote?.today_change_pct ?? null;
  return {
    ticker: tickerFromCode(code),
    market: marketFromCode(code),
    change30,
    direction,
    last,
    today,
  };
}

const fmtLast = (last: number | null) =>
  last === null
    ? "–"
    : `$${last.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

interface WatchlistRowProps {
  code: string;
  points: PricePoint[];
  quote: Quote | undefined;
  liveQuote: LiveWatchlistQuote | undefined;
  isExpanded: boolean;
  onToggle: (code: string) => void;
  snowflakeScores?: SnowflakeScores;
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
  snowflakeScores,
}: WatchlistRowProps) {
  const { ticker, market, change30, direction, last, today } =
    deriveWatchlistRow(code, points, quote, liveQuote);

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
          <div className={pulseCls}>{fmtLast(last)}</div>
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
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <DrillIn code={code} direction={direction} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// Mobile (below md) stacked-card form of one watchlist symbol. Same data +
// tap-to-expand drill-in as WatchlistRow, in the SWS card vocabulary. Card
// face: last price (primary) + today % + 30-day % on the right; ticker +
// market on the left; sparkline + mini snowflake along the bottom.
function WatchlistCard({
  code,
  points,
  quote,
  liveQuote,
  isExpanded,
  onToggle,
  snowflakeScores,
}: WatchlistRowProps) {
  const t = useT();
  const { ticker, market, change30, direction, last, today } =
    deriveWatchlistRow(code, points, quote, liveQuote);
  const pulseHash = `${last ?? ""}|${today ?? ""}`;
  const pulsing = useTickPulse(pulseHash);
  const pulseCls = pulsing ? "tick-pulse-cell" : "";

  return (
    <div>
      <div
        className={`rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
          isExpanded
            ? "bg-surface-expanded border-ink/30"
            : "bg-surface-raised border-rule hover:bg-surface-hover"
        }`}
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
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-base font-medium text-ink leading-tight">
              {ticker}
            </span>
            <span className="text-xs text-whisper uppercase tracking-wider">
              {market}
            </span>
          </div>

          <div className={`flex flex-col items-end gap-0.5 tabular shrink-0 ${pulseCls}`}>
            <div className="text-ink font-medium">{fmtLast(last)}</div>
            {today === null || today === 0 ? (
              <div className="text-xs text-whisper font-normal">
                — {t("holdings.card.today")}
              </div>
            ) : (
              <div className={`flex items-baseline gap-1 text-sm font-medium ${directionClass(today)}`}>
                <span aria-hidden>{arrowFor(today)}</span>
                <span>{fmtPct(today, 2)}</span>
                <span className="text-xs text-whisper font-normal">
                  {t("holdings.card.today")}
                </span>
              </div>
            )}
            {change30 === null ? (
              <div className="text-xs text-whisper font-normal">
                — {t("watchlist.col.30d")}
              </div>
            ) : (
              <div className={`flex items-baseline gap-1 text-sm font-medium ${directionClass(change30)}`}>
                <span aria-hidden>{arrowFor(change30)}</span>
                <span>{fmtPct(change30, 1)}</span>
                <span className="text-xs text-whisper font-normal">
                  {t("watchlist.col.30d")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <Sparkline points={points} direction={direction} />
          <Snowflake size={28} scores={snowflakeScores ?? {}} showLabels={false} showRings={false} />
        </div>
      </div>

      {isExpanded && <DrillIn code={code} direction={direction} />}
    </div>
  );
}

export function WatchlistTable({
  codes,
  sparklines,
  quotes = {},
  snowflakeScoresByCode = {},
}: Props) {
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

      {/* Mobile (below md): stacked cards. */}
      <div className="md:hidden flex flex-col gap-2">
        {codes.map((code) => (
          <WatchlistCard
            key={code}
            code={code}
            points={sparklines[code]?.points ?? []}
            quote={quotes[code]}
            liveQuote={liveMap.get(code)}
            isExpanded={expandedCode === code}
            onToggle={toggle}
            snowflakeScores={snowflakeScoresByCode[code]}
          />
        ))}
      </div>

      {/* Desktop (md+): the table, scrollable inside its box at tablet width. */}
      <div className="hidden md:block overflow-x-auto">
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
            <th className="text-center pb-3 px-3">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                {t("watchlist.col.snow")}
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
              snowflakeScores={snowflakeScoresByCode[code]}
            />
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

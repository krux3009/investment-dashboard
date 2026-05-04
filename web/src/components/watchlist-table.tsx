"use client";

import type { PriceHistory, Quote } from "@/lib/api";
import { arrowFor, directionClass, fmtPct } from "@/lib/format";
import { Fragment, useState } from "react";
import { DrillIn } from "./drill-in";
import { Sparkline } from "./sparkline";

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

export function WatchlistTable({ codes, sparklines, quotes = {} }: Props) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  if (codes.length === 0) return null;

  const toggle = (code: string) =>
    setExpandedCode((prev) => (prev === code ? null : code));

  return (
    <section className="mt-16">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.06em] text-quiet">
          Watchlist
        </div>
        <div className="text-xs text-whisper tabular">{codes.length} symbols</div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-rule">
            <th className="text-left pb-3 pr-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                Position
              </span>
            </th>
            <th className="text-right pb-3 px-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                Last
              </span>
            </th>
            <th className="text-right pb-3 px-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                Today
              </span>
            </th>
            <th className="text-right pb-3 px-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                30d
              </span>
            </th>
            <th className="pb-3 pl-4">
              <span className="text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                Trend
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {codes.map((code) => {
            const ticker = tickerFromCode(code);
            const market = marketFromCode(code);
            const points = sparklines[code]?.points ?? [];
            const has = points.length >= 2;
            const sparkLast = has ? points[points.length - 1].close : null;
            const first = has ? points[0].close : null;
            const change30 =
              has && first && first !== 0 ? (sparkLast! - first) / first : null;
            const direction: "gain" | "loss" | "quiet" =
              change30 === null ? "quiet" : change30 > 0 ? "gain" : change30 < 0 ? "loss" : "quiet";

            const quote = quotes[code];
            // Prefer the live snapshot price when available; fall back
            // to the sparkline's last cached close so the Last column
            // never shows "–" when daily bars exist.
            const last = quote?.last_price ?? sparkLast;
            const today = quote?.today_change_pct ?? null;

            const isExpanded = expandedCode === code;

            return (
              <Fragment key={code}>
                <tr
                  className={`border-t border-rule cursor-pointer transition-colors ${
                    isExpanded ? "bg-surface-expanded" : "hover:bg-surface-hover"
                  }`}
                  onClick={() => toggle(code)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(code);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isExpanded}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-medium text-ink">{ticker}</span>
                      <span className="text-xs text-whisper uppercase tracking-wider">
                        {market}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-4 text-right tabular text-ink">
                    {last === null
                      ? "–"
                      : `$${last.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`}
                  </td>

                  <td className={`py-3 px-4 text-right tabular ${directionClass(today)}`}>
                    <div className="flex items-baseline justify-end gap-1.5">
                      <span aria-hidden>{arrowFor(today)}</span>
                      <span>{fmtPct(today, 2)}</span>
                    </div>
                  </td>

                  <td className={`py-3 px-4 text-right tabular ${directionClass(change30)}`}>
                    <div className="flex items-baseline justify-end gap-1.5">
                      <span aria-hidden>{arrowFor(change30)}</span>
                      <span>{fmtPct(change30, 1)}</span>
                    </div>
                  </td>

                  <td className="py-3 pl-4">
                    <Sparkline points={points} direction={direction} />
                  </td>
                </tr>

                {isExpanded && (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <DrillIn code={code} direction={direction} />
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

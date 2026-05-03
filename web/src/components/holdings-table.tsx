// Holdings table: tabular figures, hairline rules, signed numbers with
// arrows. Mirrors src/dashboard/views/holdings.py at row level (no
// sortable headers / drill-in this chunk — those land in chunk 2).

import type { Holding } from "@/lib/api";
import { arrowFor, directionClass, fmtCurrency, fmtPct, fmtUsd } from "@/lib/format";

interface Props {
  holdings: Holding[];
}

export function HoldingsTable({ holdings }: Props) {
  if (holdings.length === 0) return null;

  return (
    <section>
      <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
        Holdings
      </div>

      <table className="w-full">
        <thead>
          <tr className="text-xs uppercase tracking-[0.04em] text-whisper">
            <th className="text-left font-medium pb-3 pr-4">Position</th>
            <th className="text-right font-medium pb-3 px-4">Qty</th>
            <th className="text-right font-medium pb-3 px-4">Price</th>
            <th className="text-right font-medium pb-3 px-4">Today</th>
            <th className="text-right font-medium pb-3 px-4">Value (USD)</th>
            <th className="text-right font-medium pb-3 pl-4">Total return</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const isUsd = h.currency === "USD";
            return (
              <tr
                key={h.code}
                className="border-t border-rule row-hover transition-colors"
              >
                {/* Position: ticker + name + market badge */}
                <td className="py-4 pr-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base font-medium text-ink">
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

                {/* Quantity */}
                <td className="py-4 px-4 text-right tabular text-ink">
                  {h.qty.toLocaleString()}
                </td>

                {/* Price (native ccy) */}
                <td className="py-4 px-4 text-right tabular text-ink">
                  {fmtCurrency(h.current_price, h.currency, { decimals: 2 })}
                </td>

                {/* Today's change — pct + abs, paired arrow */}
                <td className={`py-4 px-4 text-right tabular ${directionClass(h.today_change_pct)}`}>
                  <div className="flex items-baseline justify-end gap-1.5">
                    <span aria-hidden>{arrowFor(h.today_change_pct)}</span>
                    <span>{fmtPct(h.today_change_pct, 2)}</span>
                  </div>
                  {h.today_change_abs !== null && (
                    <div className="text-xs text-whisper">
                      {fmtCurrency(h.today_change_abs, h.currency, {
                        decimals: 2,
                        signed: true,
                      })}
                    </div>
                  )}
                </td>

                {/* Value: USD-converted. If native ≠ USD, show native as a
                    quiet sub-line so the number you see is consistent with
                    the hero (USD-first), and the original isn't lost. */}
                <td className="py-4 px-4 text-right tabular">
                  <div className="text-ink">
                    {fmtUsd(h.market_value_usd, { decimals: 2 })}
                  </div>
                  {!isUsd && (
                    <div className="text-xs text-whisper">
                      {fmtCurrency(h.market_value, h.currency, { decimals: 2 })}
                    </div>
                  )}
                </td>

                {/* Total return: pct (large) + abs USD (quiet sub-line) */}
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
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

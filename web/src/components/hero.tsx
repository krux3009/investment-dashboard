// Hero block: USD-aggregated total + signed P&L + per-currency
// breakdown on the left, allocation donut on the right.
//
// Receives an SSR-fetched HoldingsResponse. During US RTH the live SSE
// store overrides the total + P&L + (when present) the donut slices,
// without losing the SSR-rendered per-currency caption and FX rates.
// Changed cells get a 600ms tick-pulse class.

"use client";

import type { HoldingsResponse } from "@/lib/api";
import { directionClass, fmtPct, fmtUsd, timeSince } from "@/lib/format";
import { useLiveTotals } from "@/lib/live-store";
import { useTickPulse } from "@/lib/use-tick-pulse";
import { Donut } from "./donut";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", HKD: "HK$", CNH: "¥", JPY: "¥",
  SGD: "S$", AUD: "A$", MYR: "RM", CAD: "C$",
};

interface Props {
  data: HoldingsResponse;
}

export function Hero({ data }: Props) {
  const empty = data.holdings.length === 0;
  const ccyEntries = Object.entries(data.currencies);
  const isMixed = ccyEntries.length > 1;

  const liveTotals = useLiveTotals();
  const total_market_value_usd = liveTotals?.total_market_value_usd ?? data.total_market_value_usd;
  const total_pnl_abs_usd = liveTotals?.total_pnl_abs_usd ?? data.total_pnl_abs_usd;
  const total_pnl_pct = liveTotals?.total_pnl_pct ?? data.total_pnl_pct;

  const totalPulse = useTickPulse(total_market_value_usd);
  const pnlAbsPulse = useTickPulse(total_pnl_abs_usd);
  const pnlPctPulse = useTickPulse(total_pnl_pct);

  return (
    <section className="border-b border-rule pb-10 mb-10">
      <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
        Portfolio
      </div>

      <div className="flex items-start justify-between gap-12 flex-col md:flex-row">
        {/* Numbers + meta */}
        <div className="flex-1">
          <div className="flex items-baseline gap-4">
            <h1
              className={`text-5xl font-light text-ink tracking-tight tabular ${totalPulse ? "tick-pulse-cell" : ""}`}
            >
              {empty ? "–" : fmtUsd(total_market_value_usd, { decimals: 2 })}
            </h1>
            {!empty && <span className="text-sm text-quiet tabular">USD</span>}
          </div>

          {!empty && (
            <div className="flex items-baseline gap-4 text-sm mt-1">
              <span
                className={`tabular ${directionClass(total_pnl_abs_usd)} ${pnlAbsPulse ? "tick-pulse-cell" : ""}`}
              >
                {fmtUsd(total_pnl_abs_usd, { decimals: 2, signed: true })}
              </span>
              <span
                className={`tabular ${directionClass(total_pnl_pct)} ${pnlPctPulse ? "tick-pulse-cell" : ""}`}
              >
                {fmtPct(total_pnl_pct)}
              </span>
              <span className="text-quiet">total return</span>
            </div>
          )}

          {isMixed && (
            <div className="text-xs text-whisper mt-3 tabular flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {ccyEntries
                .sort(([, a], [, b]) => b - a)
                .map(([ccy, amount], i, arr) => {
                  const sym = CURRENCY_SYMBOLS[ccy] ?? "";
                  return (
                    <span key={ccy} className="inline-flex items-baseline gap-1">
                      <span>
                        {sym}
                        {amount.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                      <span className="text-whisper/80">{ccy}</span>
                      {i < arr.length - 1 && (
                        <span aria-hidden className="text-rule">·</span>
                      )}
                    </span>
                  );
                })}
              {data.fx_rates_used &&
                Object.keys(data.fx_rates_used).length > 0 && (
                  <>
                    <span aria-hidden className="text-rule">·</span>
                    {Object.entries(data.fx_rates_used).map(
                      ([pair, rate], i, arr) => (
                        <span key={pair} className="inline-flex items-baseline gap-1">
                          <span>
                            {pair} {rate.toFixed(4)}
                          </span>
                          {i < arr.length - 1 && (
                            <span aria-hidden className="text-rule">·</span>
                          )}
                        </span>
                      ),
                    )}
                  </>
                )}
            </div>
          )}

          <div className="text-xs text-whisper mt-3" suppressHydrationWarning>
            {empty ? (
              data.simulate_with_no_positions ? (
                <>
                  Querying SIMULATE. Set{" "}
                  <code className="font-mono">MOOMOO_TRD_ENV=REAL</code> in{" "}
                  <code className="font-mono">.env</code> to view your live book.
                </>
              ) : (
                "No positions returned by the API."
              )
            ) : (
              <>
                {data.fresh ? "Fresh" : "Stale"} · updated{" "}
                {timeSince(data.last_updated)}
              </>
            )}
          </div>
        </div>

        {/* Allocation donut — SSR-only. Slice weights drift slowly enough
            that live ticking would be visual noise without value. */}
        {!empty && (
          <div className="shrink-0">
            <Donut holdings={data.holdings} size={210} />
          </div>
        )}
      </div>
    </section>
  );
}

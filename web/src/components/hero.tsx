// Hero block: USD-aggregated total + signed P&L + per-currency
// breakdown on the left, allocation donut on the right. Fixes the v2
// "S$90 SGD" papercut + the v2 hover-only-donut-labels papercut.

import type { HoldingsResponse } from "@/lib/api";
import { directionClass, fmtPct, fmtUsd, timeSince } from "@/lib/format";
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

  return (
    <section className="border-b border-rule pb-10 mb-10">
      <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
        Portfolio
      </div>

      <div className="flex items-start justify-between gap-12 flex-col md:flex-row">
        {/* Numbers + meta */}
        <div className="flex-1">
          <div className="flex items-baseline gap-4">
            <h1 className="text-5xl font-light text-ink tracking-tight tabular">
              {empty ? "–" : fmtUsd(data.total_market_value_usd, { decimals: 2 })}
            </h1>
            {!empty && <span className="text-sm text-quiet tabular">USD</span>}
          </div>

          {!empty && (
            <div className="flex items-baseline gap-4 text-sm mt-1">
              <span className={`tabular ${directionClass(data.total_pnl_abs_usd)}`}>
                {fmtUsd(data.total_pnl_abs_usd, { decimals: 2, signed: true })}
              </span>
              <span className={`tabular ${directionClass(data.total_pnl_pct)}`}>
                {fmtPct(data.total_pnl_pct)}
              </span>
              <span className="text-quiet">total return</span>
            </div>
          )}

          {isMixed && (
            <div className="text-xs text-whisper mt-3 tabular">
              {ccyEntries
                .sort(([, a], [, b]) => b - a)
                .map(([ccy, amount]) => {
                  const sym = CURRENCY_SYMBOLS[ccy] ?? "";
                  return `${sym}${amount.toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })} ${ccy}`;
                })
                .join("  ·  ")}
              {data.fx_rates_used &&
                Object.keys(data.fx_rates_used).length > 0 && (
                  <span className="ml-3 text-whisper">
                    {Object.entries(data.fx_rates_used)
                      .map(([pair, rate]) => `${pair} ${rate.toFixed(4)}`)
                      .join("  ·  ")}
                  </span>
                )}
            </div>
          )}

          <div className="text-xs text-whisper mt-3">
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

        {/* Allocation donut */}
        {!empty && (
          <div className="shrink-0">
            <Donut holdings={data.holdings} size={210} />
          </div>
        )}
      </div>
    </section>
  );
}

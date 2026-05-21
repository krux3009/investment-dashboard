/**
 * /portfolio Analysis tab. Mirrors SimplyWall.st's Analysis surface:
 *   • 5 axis sub-tabs: Valuation (default) / Future / Past / Health /
 *     Dividends. Only Valuation has data right now — Future / Past /
 *     Health / Dividends defer to snowflake statement cards inline
 *     in the drill-in (P6).
 *   • Diversification section: Sectors + Geography + Top 10 Holdings.
 *
 * Data sources:
 *   • /api/portfolio/valuation                   — cash-flow value
 *   • /api/portfolio/{pe,ps,peg}-vs-market       — three gauges
 *   • /api/portfolio/sectors                     — sector buckets
 *   • /api/portfolio/geography                   — region buckets
 *   • /api/portfolio/top-holdings?n=10           — top-10 by weight
 */

import {
  fetchGeography,
  fetchPegGauge,
  fetchPeGauge,
  fetchPsGauge,
  fetchSectors,
  fetchTopHoldings,
  fetchValuation,
  type GaugeResponse,
  type GeographyBucket,
  type SectorBucket,
  type TopHolding,
  type ValuationResponse,
} from "@/lib/api";
import { ComparisonGauge } from "./comparison-gauge";
import { AnalysisSubTabs } from "./analysis-sub-tabs";

async function safe<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`fetch ${label} failed:`, e);
    return null;
  }
}

function fmtUsd(v: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(v);
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

export async function AnalysisTab() {
  const [valuation, pe, ps, peg, sectors, geography, topHoldings] = await Promise.all([
    safe(() => fetchValuation(), "valuation"),
    safe(() => fetchPeGauge(), "pe-vs-market"),
    safe(() => fetchPsGauge(), "ps-vs-market"),
    safe(() => fetchPegGauge(), "peg-vs-market"),
    safe(() => fetchSectors(), "sectors"),
    safe(() => fetchGeography(), "geography"),
    safe(() => fetchTopHoldings(10), "top-holdings"),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <AnalysisSubTabs
        valuationCards={
          <ValuationSubTab valuation={valuation} pe={pe} ps={ps} peg={peg} />
        }
      />
      <Diversification
        sectors={sectors}
        geography={geography}
        topHoldings={topHoldings}
      />
    </div>
  );
}

function ValuationSubTab({
  valuation,
  pe,
  ps,
  peg,
}: {
  valuation: ValuationResponse | null;
  pe: GaugeResponse | null;
  ps: GaugeResponse | null;
  peg: GaugeResponse | null;
}) {
  if (!valuation && !pe && !ps && !peg) {
    return (
      <p className="text-xs text-quiet">
        Valuation gauges unavailable. yfinance Ticker.info may have timed out
        for every holding — reload after the 24h cache warms.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {valuation ? <CashFlowValueCard valuation={valuation} /> : null}
      {pe ? <PriceGauge gauge={pe} unit="x" /> : null}
      {ps ? <PriceGauge gauge={ps} unit="x" /> : null}
      {peg ? <PriceGauge gauge={peg} unit="x" /> : null}
    </div>
  );
}

function CashFlowValueCard({ valuation }: { valuation: ValuationResponse }) {
  const overUnder = valuation.pct_diff;
  const tone =
    overUnder == null
      ? "neutral"
      : overUnder >= 0
        ? "over"
        : "under";
  const stateLabel =
    tone === "neutral"
      ? "Coverage thin"
      : tone === "under"
        ? `${Math.abs(overUnder!).toFixed(1)}% Undervalued`
        : `${overUnder!.toFixed(1)}% Overvalued`;
  const stateClass =
    tone === "under"
      ? "text-[var(--accent-success)]"
      : tone === "over"
        ? "text-[var(--accent-warn)]"
        : "text-quiet";
  return (
    <div className="rounded-xl border border-rule bg-surface-raised p-5 flex flex-col gap-3">
      <h4 className="text-sm font-medium text-ink">Future Cash Flow Value</h4>
      <p className={`text-2xl font-medium tabular ${stateClass}`}>{stateLabel}</p>
      <table className="w-full text-xs">
        <tbody>
          <tr>
            <td className="text-quiet py-0.5">Total Value</td>
            <td className="text-ink py-0.5 tabular text-right font-medium">
              {fmtUsd(valuation.total_value_usd)}
            </td>
          </tr>
          <tr>
            <td className="text-quiet py-0.5">Cash Flow Value</td>
            <td className="text-quiet py-0.5 tabular text-right">
              {fmtUsd(valuation.cash_flow_value_usd)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-[11px] text-quiet leading-snug">
        {valuation.coverage_count}/{valuation.total_count} holdings have analyst
        targets. Cash-flow value sums target × shares; HK/SG tickers often null.
      </p>
    </div>
  );
}

function PriceGauge({ gauge, unit }: { gauge: GaugeResponse; unit: string }) {
  if (gauge.portfolio == null) {
    return (
      <div className="rounded-xl border border-rule bg-surface-raised p-5 flex flex-col gap-2">
        <h4 className="text-sm font-medium text-ink">{gauge.label}</h4>
        <p className="text-sm text-quiet">No coverage yet ({gauge.excluded_count}/{gauge.total_count} excluded).</p>
        <p className="text-[11px] text-whisper">Cache warms on first browser hit; reload after 24h.</p>
      </div>
    );
  }
  return (
    <ComparisonGauge
      title={gauge.label}
      portfolio={gauge.portfolio}
      reference={gauge.market}
      scaleMax={gauge.scale_max}
      unit={unit}
      referenceLabel="US Market"
      sub={
        gauge.excluded_count > 0
          ? `${gauge.excluded_count}/${gauge.total_count} holdings excluded (missing or out-of-range data)`
          : undefined
      }
    />
  );
}

function Diversification({
  sectors,
  geography,
  topHoldings,
}: {
  sectors: SectorBucket[] | null;
  geography: GeographyBucket[] | null;
  topHoldings: TopHolding[] | null;
}) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-lg font-medium text-ink">Diversification</h2>

      <SectorBars sectors={sectors} />
      <GeographyBars geography={geography} />
      <TopHoldingsCard topHoldings={topHoldings} />
    </section>
  );
}

function SectorBars({ sectors }: { sectors: SectorBucket[] | null }) {
  if (!sectors || sectors.length === 0) {
    return (
      <p className="text-xs text-quiet">Sector breakdown unavailable.</p>
    );
  }
  const maxPct = sectors[0]?.weight_pct ?? 100;
  return (
    <article className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">Across Industries</h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">% weight</p>
      </header>
      <ul className="flex flex-col gap-2">
        {sectors.map((s) => (
          <li key={s.sector} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink">{s.sector}</span>
              <span className="tabular text-quiet">{s.weight_pct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(s.weight_pct / maxPct) * 100}%`,
                  background: "var(--accent-primary)",
                }}
              />
            </div>
            {s.tickers.length > 0 ? (
              <p className="text-[10px] text-whisper">
                {s.tickers.map((t) => t.code.split(".").pop()).join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

function GeographyBars({ geography }: { geography: GeographyBucket[] | null }) {
  if (!geography || geography.length === 0) {
    return <p className="text-xs text-quiet">Geography breakdown unavailable.</p>;
  }
  const maxPct = geography[0]?.weight_pct ?? 100;
  return (
    <article className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">Revenue & Listing Geography</h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">% weight</p>
      </header>
      <ul className="flex flex-col gap-2">
        {geography.map((g) => (
          <li key={g.region} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink">{g.region}</span>
              <span className="tabular text-quiet">{g.weight_pct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(g.weight_pct / maxPct) * 100}%`,
                  background: "var(--accent-primary)",
                }}
              />
            </div>
            {g.tickers.length > 0 ? (
              <p className="text-[10px] text-whisper">
                {g.tickers.map((t) => t.code.split(".").pop()).join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

function TopHoldingsCard({ topHoldings }: { topHoldings: TopHolding[] | null }) {
  if (!topHoldings || topHoldings.length === 0) {
    return <p className="text-xs text-quiet">Top holdings unavailable.</p>;
  }
  const maxPct = topHoldings[0]?.weight_pct ?? 100;
  return (
    <article className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">Top {topHoldings.length} Holdings</h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">% weight</p>
      </header>
      <ul className="flex flex-col gap-2">
        {topHoldings.map((h) => (
          <li key={h.code} className="flex items-center gap-3">
            <div className="flex flex-col flex-shrink-0 w-24">
              <span className="text-sm text-ink font-medium">{h.code.split(".").pop()}</span>
              <span className="text-[10px] text-quiet truncate">{h.name}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden flex-1">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(h.weight_pct / maxPct) * 100}%`,
                  background: "var(--accent-primary)",
                }}
              />
            </div>
            <div className="tabular text-right text-sm w-28">
              <div className="text-ink">{h.weight_pct.toFixed(1)}%</div>
              <div className="text-[10px] text-quiet">{fmtUsd(h.value_usd, 0)}</div>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

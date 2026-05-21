"use client";

/**
 * Client presentation layer for the /portfolio Analysis tab. The tab
 * (analysis-tab.tsx) is a SERVER component doing the data fetch; this view
 * holds all the JSX so it can call useT() for live language toggle.
 *
 * Keeps the AnalysisSubTabs shell + ComparisonGauge cards.
 */

import {
  type GaugeResponse,
  type GeographyBucket,
  type SectorBucket,
  type TopHolding,
  type ValuationResponse,
} from "@/lib/api";
import { ComparisonGauge } from "./comparison-gauge";
import { AnalysisSubTabs } from "./analysis-sub-tabs";
import { useT } from "@/lib/i18n/use-t";
import type { StringKey } from "@/lib/i18n/strings";

// yfinance GICS sector names → i18n key. Falls back to the raw English when
// a sector isn't in the map (new yfinance label, or a null/Unknown bucket).
const SECTOR_KEY: Record<string, StringKey> = {
  "Technology": "analysis.sector.technology",
  "Communication Services": "analysis.sector.communication_services",
  "Financial Services": "analysis.sector.financial_services",
  "Healthcare": "analysis.sector.healthcare",
  "Consumer Cyclical": "analysis.sector.consumer_cyclical",
  "Consumer Defensive": "analysis.sector.consumer_defensive",
  "Industrials": "analysis.sector.industrials",
  "Energy": "analysis.sector.energy",
  "Utilities": "analysis.sector.utilities",
  "Real Estate": "analysis.sector.real_estate",
  "Basic Materials": "analysis.sector.basic_materials",
};

// Region buckets emitted by /api/portfolio/geography → i18n key.
const REGION_KEY: Record<string, StringKey> = {
  "N.America": "analysis.region.n_america",
  "Europe": "analysis.region.europe",
  "Asia-Pacific": "analysis.region.asia_pacific",
  "ROW": "analysis.region.row",
};

function fmtUsd(v: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(v);
}

interface Props {
  valuation: ValuationResponse | null;
  pe: GaugeResponse | null;
  ps: GaugeResponse | null;
  peg: GaugeResponse | null;
  sectors: SectorBucket[] | null;
  geography: GeographyBucket[] | null;
  topHoldings: TopHolding[] | null;
}

export function AnalysisView({
  valuation,
  pe,
  ps,
  peg,
  sectors,
  geography,
  topHoldings,
}: Props) {
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
  const t = useT();
  if (!valuation && !pe && !ps && !peg) {
    return (
      <p className="text-xs text-quiet">{t("analysis.valuation.unavailable")}</p>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {valuation ? <CashFlowValueCard valuation={valuation} /> : null}
      {pe ? <PriceGauge gauge={pe} unit="x" titleKey="analysis.gauge.pe" /> : null}
      {ps ? <PriceGauge gauge={ps} unit="x" titleKey="analysis.gauge.ps" /> : null}
      {peg ? <PriceGauge gauge={peg} unit="x" titleKey="analysis.gauge.peg" /> : null}
    </div>
  );
}

function CashFlowValueCard({ valuation }: { valuation: ValuationResponse }) {
  const t = useT();
  const overUnder = valuation.pct_diff;
  const tone =
    overUnder == null
      ? "neutral"
      : overUnder >= 0
        ? "over"
        : "under";
  const stateLabel =
    tone === "neutral"
      ? t("analysis.cashflow.coverage_thin")
      : tone === "under"
        ? t("analysis.cashflow.undervalued", { pct: Math.abs(overUnder!).toFixed(1) })
        : t("analysis.cashflow.overvalued", { pct: overUnder!.toFixed(1) });
  const stateClass =
    tone === "under"
      ? "text-[var(--accent-success)]"
      : tone === "over"
        ? "text-[var(--accent-warn)]"
        : "text-quiet";
  return (
    <div className="rounded-xl border border-rule bg-surface-raised p-5 flex flex-col gap-3">
      <h4 className="text-sm font-medium text-ink">{t("analysis.cashflow.heading")}</h4>
      <p className={`text-2xl font-medium tabular ${stateClass}`}>{stateLabel}</p>
      <table className="w-full text-xs">
        <tbody>
          <tr>
            <td className="text-quiet py-0.5">{t("analysis.cashflow.total_value")}</td>
            <td className="text-ink py-0.5 tabular text-right font-medium">
              {fmtUsd(valuation.total_value_usd)}
            </td>
          </tr>
          <tr>
            <td className="text-quiet py-0.5">{t("analysis.cashflow.cash_flow_value")}</td>
            <td className="text-quiet py-0.5 tabular text-right">
              {fmtUsd(valuation.cash_flow_value_usd)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-[11px] text-quiet leading-snug">
        {t("analysis.cashflow.coverage_note", {
          coverage: valuation.coverage_count,
          total: valuation.total_count,
        })}
      </p>
    </div>
  );
}

function PriceGauge({ gauge, unit, titleKey }: { gauge: GaugeResponse; unit: string; titleKey: StringKey }) {
  const t = useT();
  const title = t(titleKey);
  if (gauge.portfolio == null) {
    return (
      <div className="rounded-xl border border-rule bg-surface-raised p-5 flex flex-col gap-2">
        <h4 className="text-sm font-medium text-ink">{title}</h4>
        <p className="text-sm text-quiet">
          {t("analysis.gauge.no_coverage", {
            excluded: gauge.excluded_count,
            total: gauge.total_count,
          })}
        </p>
        <p className="text-[11px] text-whisper">{t("analysis.gauge.cache_warms")}</p>
      </div>
    );
  }
  return (
    <ComparisonGauge
      title={title}
      portfolio={gauge.portfolio}
      reference={gauge.market}
      scaleMax={gauge.scale_max}
      unit={unit}
      portfolioLabel={t("analysis.gauge.portfolio")}
      referenceLabel={t("analysis.gauge.us_market")}
      sub={
        gauge.excluded_count > 0
          ? t("analysis.gauge.excluded_note", {
              excluded: gauge.excluded_count,
              total: gauge.total_count,
            })
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
  const t = useT();
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-lg font-medium text-ink">{t("analysis.diversification.heading")}</h2>

      <SectorBars sectors={sectors} />
      <GeographyBars geography={geography} />
      <TopHoldingsCard topHoldings={topHoldings} />
    </section>
  );
}

function SectorBars({ sectors }: { sectors: SectorBucket[] | null }) {
  const t = useT();
  if (!sectors || sectors.length === 0) {
    return (
      <p className="text-xs text-quiet">{t("analysis.sectors.unavailable")}</p>
    );
  }
  const maxPct = sectors[0]?.weight_pct ?? 100;
  return (
    <article className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">{t("analysis.sectors.heading")}</h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">{t("analysis.weight_pct")}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {sectors.map((s) => (
          <li key={s.sector} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink">{SECTOR_KEY[s.sector] ? t(SECTOR_KEY[s.sector]) : s.sector}</span>
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
                {s.tickers.map((tk) => tk.code.split(".").pop()).join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

function GeographyBars({ geography }: { geography: GeographyBucket[] | null }) {
  const t = useT();
  if (!geography || geography.length === 0) {
    return <p className="text-xs text-quiet">{t("analysis.geography.unavailable")}</p>;
  }
  const maxPct = geography[0]?.weight_pct ?? 100;
  return (
    <article className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">{t("analysis.geography.heading")}</h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">{t("analysis.weight_pct")}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {geography.map((g) => (
          <li key={g.region} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink">{REGION_KEY[g.region] ? t(REGION_KEY[g.region]) : g.region}</span>
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
                {g.tickers.map((tk) => tk.code.split(".").pop()).join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

function TopHoldingsCard({ topHoldings }: { topHoldings: TopHolding[] | null }) {
  const t = useT();
  if (!topHoldings || topHoldings.length === 0) {
    return <p className="text-xs text-quiet">{t("analysis.top_holdings.unavailable")}</p>;
  }
  const maxPct = topHoldings[0]?.weight_pct ?? 100;
  return (
    <article className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">
          {t("analysis.top_holdings.heading", { n: topHoldings.length })}
        </h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">{t("analysis.weight_pct")}</p>
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

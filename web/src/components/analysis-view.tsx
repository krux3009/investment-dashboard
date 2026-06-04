"use client";

/**
 * Client presentation layer for the /portfolio Analysis tab. The tab
 * (analysis-tab.tsx) is a SERVER component doing the data fetch; this view
 * holds all the JSX so it can call useT() for live language toggle.
 *
 * Keeps the AnalysisSubTabs shell + ComparisonGauge cards.
 */

import {
  type DividendsResponse,
  type FutureResponse,
  type GaugeResponse,
  type GeographyBucket,
  type HealthResponse,
  type PastResponse,
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
  future: FutureResponse | null;
  past: PastResponse | null;
  health: HealthResponse | null;
  dividends: DividendsResponse | null;
  sectors: SectorBucket[] | null;
  geography: GeographyBucket[] | null;
  topHoldings: TopHolding[] | null;
}

export function AnalysisView({
  valuation,
  pe,
  ps,
  peg,
  future,
  past,
  health,
  dividends,
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
        futureCards={<FutureSubTab future={future} />}
        pastCards={<PastSubTab past={past} />}
        healthCards={<HealthSubTab health={health} />}
        dividendsCards={<DividendsSubTab dividends={dividends} />}
      />
      <Diversification
        sectors={sectors}
        geography={geography}
        topHoldings={topHoldings}
      />
    </div>
  );
}

// ── Shared formatters + bar primitive for the v5 axes ────────────────────────

function fmtSignedPct(frac: number | null | undefined, digits = 1): string {
  if (frac == null) return "—";
  const v = frac * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function fmtRatio(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

interface MetricRow {
  code: string;
  ticker: string;
  value: number | null;
  caption?: string | null;
}

/**
 * Per-holding horizontal bars scaled by magnitude. Bar width tracks
 * |value| against the largest |value| in the set; the figure on the
 * right carries direction/units (no-sole-signal — bars stay gold).
 * `format` renders the label; defaults to a signed percentage.
 */
function MetricBars({
  rows,
  format = (v) => fmtSignedPct(v),
}: {
  rows: MetricRow[];
  format?: (v: number) => string;
}) {
  const t = useT();
  const present = rows.filter((r) => r.value != null);
  if (present.length === 0) {
    return <p className="text-xs text-quiet">{t("analysis.axis.no_coverage")}</p>;
  }
  const maxAbs = Math.max(...present.map((r) => Math.abs(r.value as number)), 0.0001);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const label = r.value == null ? "—" : format(r.value);
        const width = r.value == null ? 0 : (Math.abs(r.value) / maxAbs) * 100;
        return (
          <li key={r.code} className="flex items-center gap-3">
            <div className="flex flex-col flex-shrink-0 w-20">
              <span className="text-sm text-ink font-medium">{r.ticker}</span>
              {r.caption ? (
                <span className="text-[10px] text-quiet truncate">{r.caption}</span>
              ) : null}
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden flex-1">
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, background: "var(--accent-primary)" }}
              />
            </div>
            <span className="tabular text-right text-sm text-ink w-20">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function StatHeadline({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "pos" | "warn";
}) {
  const cls =
    tone === "pos"
      ? "text-[var(--accent-success)]"
      : tone === "warn"
        ? "text-[var(--accent-warn)]"
        : "text-ink";
  return (
    <div className="rounded-xl border border-rule bg-surface-raised p-5 flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">{label}</p>
      <p className={`text-2xl font-medium tabular ${cls}`}>{value}</p>
      {sub ? <p className="text-[11px] text-quiet">{sub}</p> : null}
    </div>
  );
}

function CoverageNote({ covered, total }: { covered: number; total: number }) {
  const t = useT();
  return (
    <p className="text-[11px] text-quiet">
      {t("analysis.axis.coverage", { covered, total })}
    </p>
  );
}

// ── Future ───────────────────────────────────────────────────────────────────

function FutureSubTab({ future }: { future: FutureResponse | null }) {
  const t = useT();
  if (!future || future.portfolio_eps_growth == null) {
    return <p className="text-xs text-quiet">{t("analysis.future.unavailable")}</p>;
  }
  const beatsIndex =
    future.index_growth != null && future.portfolio_eps_growth >= future.index_growth;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatHeadline
          label={t("analysis.future.eps_growth")}
          value={fmtSignedPct(future.portfolio_eps_growth)}
          tone={beatsIndex ? "pos" : "neutral"}
          sub={
            future.index_growth != null
              ? t("analysis.future.vs_index", { pct: fmtSignedPct(future.index_growth) })
              : undefined
          }
        />
        <StatHeadline
          label={t("analysis.future.rev_growth")}
          value={fmtSignedPct(future.portfolio_rev_growth)}
        />
      </div>
      <div className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-ink">{t("analysis.future.per_holding")}</h4>
          <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">
            {t("analysis.future.eps_growth_short")}
          </p>
        </header>
        <MetricBars
          rows={future.per_holding.map((h) => ({
            code: h.code,
            ticker: h.ticker,
            value: h.eps_growth,
            caption: h.rev_growth != null ? t("analysis.future.rev_short", { pct: fmtSignedPct(h.rev_growth) }) : null,
          }))}
        />
      </div>
      <CoverageNote covered={future.covered_count} total={future.total_count} />
    </div>
  );
}

// ── Past ───────────────────────────────────────────────────────────────────

function PastSubTab({ past }: { past: PastResponse | null }) {
  const t = useT();
  if (!past || (past.portfolio_rev_cagr == null && past.portfolio_earnings_cagr == null)) {
    return <p className="text-xs text-quiet">{t("analysis.past.unavailable")}</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatHeadline
          label={t("analysis.past.rev_cagr")}
          value={fmtSignedPct(past.portfolio_rev_cagr)}
        />
        <StatHeadline
          label={t("analysis.past.earnings_cagr")}
          value={fmtSignedPct(past.portfolio_earnings_cagr)}
          tone={past.portfolio_earnings_cagr != null && past.portfolio_earnings_cagr < 0 ? "warn" : "neutral"}
        />
      </div>
      <div className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-ink">{t("analysis.past.per_holding")}</h4>
          <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">
            {t("analysis.past.rev_cagr_short")}
          </p>
        </header>
        <MetricBars
          rows={past.per_holding.map((h) => ({
            code: h.code,
            ticker: h.ticker,
            value: h.rev_cagr,
            caption: h.earnings_cagr != null ? t("analysis.past.earn_short", { pct: fmtSignedPct(h.earnings_cagr) }) : null,
          }))}
        />
      </div>
      <CoverageNote covered={past.covered_count} total={past.total_count} />
    </div>
  );
}

// ── Health ───────────────────────────────────────────────────────────────────

// D/E ≤ 1 reads healthy; current ratio ≥ 1.5 reads healthy. The chip glyph
// (check / warn) carries the read so colour is never the sole signal.
function HealthChip({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok == null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-quiet">{label}</span>
    );
  }
  const cls = ok ? "text-[var(--accent-success)]" : "text-[var(--accent-warn)]";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${cls}`}>
      <span aria-hidden>{ok ? "✓" : "!"}</span>
      {label}
    </span>
  );
}

function HealthSubTab({ health }: { health: HealthResponse | null }) {
  const t = useT();
  if (!health || (health.portfolio_debt_to_equity == null && health.portfolio_current_ratio == null)) {
    return <p className="text-xs text-quiet">{t("analysis.health.unavailable")}</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatHeadline
          label={t("analysis.health.debt_equity")}
          value={fmtRatio(health.portfolio_debt_to_equity)}
          tone={
            health.portfolio_debt_to_equity == null
              ? "neutral"
              : health.portfolio_debt_to_equity <= 1
                ? "pos"
                : "warn"
          }
          sub={t("analysis.health.debt_equity_note")}
        />
        <StatHeadline
          label={t("analysis.health.current_ratio")}
          value={fmtRatio(health.portfolio_current_ratio)}
          tone={
            health.portfolio_current_ratio == null
              ? "neutral"
              : health.portfolio_current_ratio >= 1.5
                ? "pos"
                : "warn"
          }
          sub={t("analysis.health.current_ratio_note")}
        />
      </div>
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium text-ink">{t("analysis.health.per_holding")}</h4>
        <ul className="flex flex-col divide-y divide-rule">
          {health.per_holding.map((h) => (
            <li key={h.code} className="flex items-center justify-between py-2">
              <span className="text-sm text-ink font-medium w-20">{h.ticker}</span>
              <div className="flex items-center gap-4">
                <HealthChip
                  ok={h.debt_to_equity == null ? null : h.debt_to_equity <= 1}
                  label={t("analysis.health.de_chip", { v: fmtRatio(h.debt_to_equity) })}
                />
                <HealthChip
                  ok={h.current_ratio == null ? null : h.current_ratio >= 1.5}
                  label={t("analysis.health.cr_chip", { v: fmtRatio(h.current_ratio) })}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <CoverageNote covered={health.covered_count} total={health.total_count} />
    </div>
  );
}

// ── Dividends (reuses the dividend feed; compact vs the full Dividends tab) ──

function DividendsSubTab({ dividends }: { dividends: DividendsResponse | null }) {
  const t = useT();
  if (!dividends || dividends.items.length === 0) {
    return <p className="text-xs text-quiet">{t("analysis.dividends.unavailable")}</p>;
  }
  const payers = dividends.items.filter((d) => d.ttm_total_usd > 0);
  const rows: MetricRow[] = dividends.items.map((d) => ({
    code: d.code,
    ticker: d.ticker,
    value: d.ttm_total_usd > 0 ? d.ttm_total_usd : null,
    caption: d.is_reit ? t("analysis.dividends.reit") : null,
  }));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatHeadline
          label={t("analysis.dividends.ttm_income")}
          value={fmtUsd(dividends.totals.ttm_total_usd)}
          tone={dividends.totals.ttm_total_usd > 0 ? "pos" : "neutral"}
        />
        <StatHeadline
          label={t("analysis.dividends.payers")}
          value={`${payers.length} / ${dividends.items.length}`}
          sub={t("analysis.dividends.next_90d", { usd: fmtUsd(dividends.totals.next_90d_total_usd) })}
        />
      </div>
      <div className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-ink">{t("analysis.dividends.per_holding")}</h4>
          <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">
            {t("analysis.dividends.ttm_short")}
          </p>
        </header>
        <MetricBars rows={rows} format={(v) => fmtUsd(v)} />
      </div>
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

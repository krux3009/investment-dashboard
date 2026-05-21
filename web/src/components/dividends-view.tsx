"use client";

/**
 * Client presentation layer for the /portfolio Dividends tab. The tab
 * (dividends-tab.tsx) is a SERVER component doing the data fetch; this view
 * holds all the JSX so it can call useT() for live language toggle.
 *
 * Renders the unavailable state itself when ledger/forecast come back null.
 */

import {
  type DividendForecastResponse,
  type DividendQualityResponse,
  type DividendsResponse,
} from "@/lib/api";
import { DividendsForecastSwitcher } from "./dividends-forecast-switcher";
import { useT } from "@/lib/i18n/use-t";

function fmtUsd(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function fmtPct(value: number | null, fractionDigits = 2): string {
  if (value == null) return "—";
  return `${value.toFixed(fractionDigits)}%`;
}

interface Props {
  ledger: DividendsResponse | null;
  forecast: DividendForecastResponse | null;
  buckets: DividendQualityResponse | null;
}

export function DividendsView({ ledger, forecast, buckets }: Props) {
  const t = useT();

  if (!ledger || !forecast) {
    return (
      <section className="rounded-xl border border-dashed border-rule bg-surface-raised p-10 text-center">
        <p className="text-sm font-medium text-ink">{t("dividends.unavailable")}</p>
        <p className="mt-2 text-xs text-quiet">{t("dividends.backend_unreachable")}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <IncomeHero ledger={ledger} forecast={forecast} />
      <DividendHistoryBars ledger={ledger} />
      <ContributorsRow forecast={forecast} />
      <QualityBucketsCard buckets={buckets} />
      <DividendsForecastSwitcher initial={forecast} />
    </div>
  );
}

function IncomeHero({
  ledger,
  forecast,
}: {
  ledger: DividendsResponse;
  forecast: DividendForecastResponse;
}) {
  const t = useT();
  const monthly = forecast.monthly_avg_usd;
  const totalsTtm = ledger.totals.ttm_total_usd;
  // currentYield + yieldOnCost are weighted within the forecast rows
  const validYields = forecast.holdings.filter((h) => h.yield_pct != null);
  const currentYieldAvg =
    validYields.length === 0
      ? null
      : validYields.reduce((s, h) => s + (h.yield_pct ?? 0) * h.payment_12m_usd, 0) /
        validYields.reduce((s, h) => s + h.payment_12m_usd, 1);

  const validYoc = forecast.holdings.filter((h) => h.yield_on_cost_pct != null);
  const yieldOnCostAvg =
    validYoc.length === 0
      ? null
      : validYoc.reduce((s, h) => s + (h.yield_on_cost_pct ?? 0) * h.payment_12m_usd, 0) /
        validYoc.reduce((s, h) => s + h.payment_12m_usd, 1);

  const yoyDelta =
    totalsTtm > 0 ? ((forecast.total_usd - totalsTtm) / totalsTtm) * 100 : null;

  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-medium text-ink">{t("dividends.income.heading")}</h2>
          <p className="text-xs text-quiet">
            {t("dividends.income.from_payers", {
              n: forecast.holdings.filter((h) => h.payment_12m_usd > 0).length,
            })}
          </p>
        </div>
        <p className="text-xs text-quiet">{forecast.as_of}</p>
      </header>

      <div className="flex items-baseline gap-3">
        <span className="font-serif text-4xl font-medium text-[var(--accent-primary)] tabular">
          {fmtUsd(forecast.total_usd, 0)}
        </span>
        {yoyDelta != null ? (
          <span
            className={`text-sm tabular ${
              yoyDelta >= 0 ? "text-[var(--accent-success)]" : "text-[var(--accent-danger)]"
            }`}
          >
            {t("dividends.income.vs_last_12m", {
              delta: `${yoyDelta >= 0 ? "+" : "−"}${Math.abs(yoyDelta).toFixed(1)}`,
            })}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3 pt-2">
        <StatTile label={t("dividends.income.monthly")} value={fmtUsd(monthly, 2)} />
        <StatTile label={t("dividends.income.current_yield")} value={fmtPct(currentYieldAvg)} />
        <StatTile label={t("dividends.income.yield_on_cost")} value={fmtPct(yieldOnCostAvg)} />
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface p-3">
      <span className="text-[10px] uppercase tracking-[0.08em] text-quiet">{label}</span>
      <span className="tabular text-base font-medium text-ink">{value}</span>
    </div>
  );
}

function DividendHistoryBars({ ledger }: { ledger: DividendsResponse }) {
  const t = useT();
  // Aggregate all per-holding history into a single monthly USD series.
  // We bucket by YYYY-MM ex-date and roll forward 16 months ending this month.
  const byMonth: Record<string, number> = {};
  for (const item of ledger.items) {
    for (const p of item.history) {
      const ym = p.ex_date.slice(0, 7);
      byMonth[ym] = (byMonth[ym] ?? 0) + p.amount_total_usd;
    }
  }
  const today = new Date(ledger.as_of);
  const months: { ym: string; total: number }[] = [];
  for (let i = 15; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ ym, total: byMonth[ym] ?? 0 });
  }
  const max = Math.max(...months.map((m) => m.total), 1);
  const total16 = months.reduce((s, m) => s + m.total, 0);

  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-ink">{t("dividends.history.title")}</h2>
        <p className="text-xs text-quiet">{t("dividends.history.rolling")}</p>
      </header>

      {total16 === 0 ? (
        <p className="text-sm text-quiet italic py-8 text-center">
          {t("dividends.history.none_16m")}
        </p>
      ) : (
      <div className="flex items-end gap-1.5">
        {months.map((m) => {
          const h = (m.total / max) * 100;
          return (
            <div
              key={m.ym}
              className="flex-1 flex flex-col items-center gap-1"
              title={`${m.ym}: ${fmtUsd(m.total, 2)}`}
            >
              {/* Fixed-height track so the bar's % height has a definite
                  parent to resolve against (a bare flex column collapses). */}
              <div className="w-full h-32 flex items-end">
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.max(2, h)}%`,
                    background: m.total > 0 ? "var(--accent-primary)" : "var(--rule)",
                    opacity: m.total > 0 ? 1 : 0.4,
                  }}
                />
              </div>
              <span className="text-[9px] uppercase tracking-[0.04em] text-whisper">
                {m.ym.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

function ContributorsRow({ forecast }: { forecast: DividendForecastResponse }) {
  const t = useT();
  const payers = forecast.holdings.filter((h) => h.payment_12m_usd > 0);
  const sorted = [...payers].sort((a, b) => b.payment_12m_usd - a.payment_12m_usd);
  const largest = sorted.slice(0, 5);
  const smallest =
    sorted.length > 5 ? [...sorted].slice(-5).reverse() : [...sorted].reverse();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ContribCard title={t("dividends.contrib.largest")} rows={largest} />
      <ContribCard title={t("dividends.contrib.smallest")} rows={smallest} />
    </div>
  );
}

function ContribCard({
  title,
  rows,
}: {
  title: string;
  rows: DividendForecastResponse["holdings"];
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">{t("dividends.contrib.unit_12m")}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <li className="text-xs text-quiet">{t("dividends.contrib.none_paying")}</li>
        ) : (
          rows.map((r) => (
            <li key={r.code} className="flex items-baseline justify-between">
              <span className="text-sm text-ink font-medium">{r.ticker}</span>
              <div className="flex items-baseline gap-2 tabular">
                <span className="text-ink">{fmtUsd(r.payment_12m_usd, 2)}</span>
                <span className="text-[10px] text-quiet">{fmtPct(r.yield_pct)}</span>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function QualityBucketsCard({ buckets }: { buckets: DividendQualityResponse | null }) {
  const t = useT();
  if (!buckets) {
    return null;
  }
  const order: Array<{ key: "low" | "medium" | "high"; label: string; scoreRange: string }> = [
    { key: "low", label: t("dividends.quality.low"), scoreRange: "0-2" },
    { key: "medium", label: t("dividends.quality.medium"), scoreRange: "3-4" },
    { key: "high", label: t("dividends.quality.high"), scoreRange: "5-6" },
  ];
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-ink">{t("dividends.quality.heading")}</h2>
        <p className="text-xs text-quiet">{t("dividends.quality.subhead")}</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {order.map((o) => {
          const b = buckets.buckets[o.key];
          return (
            <div key={o.key} className="rounded-lg bg-surface p-4 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-quiet">
                {t("dividends.quality.bucket_label", { label: o.label, range: o.scoreRange })}
              </span>
              <span className="tabular text-2xl font-medium text-ink">
                {fmtUsd(b.total_usd, 2)}
              </span>
              <span className="text-xs text-quiet">
                {t("dividends.quality.holdings_count", {
                  count: b.count,
                  pct: b.pct.toFixed(1),
                })}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

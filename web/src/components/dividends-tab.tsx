/**
 * /portfolio Dividends tab. Mirrors SimplyWall.st's Dividends surface:
 *   • Next 12m Income hero card
 *   • Monthly Income / Current Yield / Yield on Cost stats
 *   • Dividend History monthly bars (rolling 16 months)
 *   • Largest / Smallest contributor lists
 *   • Dividend Quality & Forecast buckets card
 *   • Forward dividend forecast (12m / 24m / 36m toggle)
 *   • Per-holding table
 *
 * Data sources:
 *   • /api/dividends                       — existing ledger
 *   • /api/dividends/forecast?horizon=…    — forecast rows
 *   • /api/dividends/quality-buckets       — quality bucket counts
 */

import {
  fetchDividendForecast,
  fetchDividendQualityBuckets,
  fetchDividends,
  type DividendForecastResponse,
  type DividendQualityResponse,
  type DividendsResponse,
} from "@/lib/api";
import { DividendsForecastSwitcher } from "./dividends-forecast-switcher";

async function safe<T>(p: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await p();
  } catch (e) {
    console.warn(`fetch ${label} failed:`, e);
    return null;
  }
}

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

export async function DividendsTab() {
  const [ledger, forecast12, buckets] = await Promise.all([
    safe(() => fetchDividends(), "/dividends"),
    safe(() => fetchDividendForecast("12m"), "/dividends/forecast"),
    safe(() => fetchDividendQualityBuckets(), "/dividends/quality-buckets"),
  ]);

  if (!ledger || !forecast12) {
    return (
      <section className="rounded-xl border border-dashed border-rule bg-surface-raised p-10 text-center">
        <p className="text-sm font-medium text-ink">Dividend data unavailable.</p>
        <p className="mt-2 text-xs text-quiet">
          Backend unreachable — check FastAPI on port 8000.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <IncomeHero ledger={ledger} forecast={forecast12} />
      <DividendHistoryBars ledger={ledger} />
      <ContributorsRow forecast={forecast12} />
      <QualityBucketsCard buckets={buckets} />
      <DividendsForecastSwitcher initial={forecast12} />
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
          <h2 className="text-lg font-medium text-ink">Next 12m Income</h2>
          <p className="text-xs text-quiet">From {forecast.holdings.filter((h) => h.payment_12m_usd > 0).length} dividend-paying holdings</p>
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
            {yoyDelta >= 0 ? "+" : "−"}
            {Math.abs(yoyDelta).toFixed(1)}% vs last 12m
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3 pt-2">
        <StatTile label="Monthly Income" value={fmtUsd(monthly, 2)} />
        <StatTile label="Current Yield" value={fmtPct(currentYieldAvg)} />
        <StatTile label="Yield on Cost" value={fmtPct(yieldOnCostAvg)} />
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

  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-ink">Dividend History</h2>
        <p className="text-xs text-quiet">Rolling 16 months · USD</p>
      </header>

      <div className="flex items-end gap-1.5 h-32">
        {months.map((m) => {
          const h = (m.total / max) * 100;
          return (
            <div
              key={m.ym}
              className="flex-1 flex flex-col items-center justify-end gap-1"
              title={`${m.ym}: ${fmtUsd(m.total, 2)}`}
            >
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${Math.max(2, h)}%`,
                  background: m.total > 0 ? "var(--accent-primary)" : "var(--rule)",
                  opacity: m.total > 0 ? 1 : 0.4,
                }}
              />
              <span className="text-[9px] uppercase tracking-[0.04em] text-whisper">
                {m.ym.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ContributorsRow({ forecast }: { forecast: DividendForecastResponse }) {
  const payers = forecast.holdings.filter((h) => h.payment_12m_usd > 0);
  const sorted = [...payers].sort((a, b) => b.payment_12m_usd - a.payment_12m_usd);
  const largest = sorted.slice(0, 5);
  const smallest =
    sorted.length > 5 ? [...sorted].slice(-5).reverse() : [...sorted].reverse();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ContribCard title="Largest Contributors" rows={largest} />
      <ContribCard title="Smallest Contributors" rows={smallest} />
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
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">12m USD</p>
      </header>
      <ul className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <li className="text-xs text-quiet">No paying holdings.</li>
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
  if (!buckets) {
    return null;
  }
  const order: Array<{ key: "low" | "medium" | "high"; label: string; scoreRange: string }> = [
    { key: "low", label: "Low", scoreRange: "0-2" },
    { key: "medium", label: "Medium", scoreRange: "3-4" },
    { key: "high", label: "High", scoreRange: "5-6" },
  ];
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-ink">Dividend Quality & Forecast</h2>
        <p className="text-xs text-quiet">Buckets by snowflake dividend score</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {order.map((o) => {
          const b = buckets.buckets[o.key];
          return (
            <div key={o.key} className="rounded-lg bg-surface p-4 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-quiet">
                {o.label} · score {o.scoreRange}
              </span>
              <span className="tabular text-2xl font-medium text-ink">
                {fmtUsd(b.total_usd, 2)}
              </span>
              <span className="text-xs text-quiet">
                {b.count} holding{b.count === 1 ? "" : "s"} · {b.pct.toFixed(1)}% of TTM
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

"use client";

/**
 * Client-side per-horizon switcher for the dividend forecast table.
 * Fetches /api/dividends/forecast?horizon={12m|24m|36m} on tab change.
 */

import { useState } from "react";
import {
  fetchDividendForecast,
  type DividendForecastResponse,
  type Horizon,
} from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";
import type { StringKey } from "@/lib/i18n/strings";

const HORIZONS: { key: Horizon; labelKey: StringKey }[] = [
  { key: "12m", labelKey: "dividends.forecast.horizon.12m" },
  { key: "24m", labelKey: "dividends.forecast.horizon.24m" },
  { key: "36m", labelKey: "dividends.forecast.horizon.36m" },
];

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

function scoreClass(score: number | null): string {
  if (score == null) return "text-quiet";
  if (score <= 2) return "text-[var(--accent-danger)]";
  if (score <= 4) return "text-[var(--accent-warn)]";
  return "text-[var(--accent-success)]";
}

interface Props {
  initial: DividendForecastResponse;
}

export function DividendsForecastSwitcher({ initial }: Props) {
  const t = useT();
  const [horizon, setHorizon] = useState<Horizon>("12m");
  const [data, setData] = useState<DividendForecastResponse>(initial);
  const [loading, setLoading] = useState(false);

  async function onSelect(h: Horizon) {
    if (h === horizon) return;
    setHorizon(h);
    setLoading(true);
    try {
      const next = await fetchDividendForecast(h);
      setData(next);
    } catch (e) {
      console.warn("forecast horizon fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-medium text-ink">{t("dividends.forecast.heading")}</h2>
          <p className="text-xs text-quiet">{t("dividends.forecast.subhead")}</p>
        </div>
        <div className="flex items-baseline gap-3 text-xs">
          {HORIZONS.map((h) => {
            const active = h.key === horizon;
            return (
              <button
                key={h.key}
                type="button"
                onClick={() => onSelect(h.key)}
                className={
                  "uppercase tracking-[0.06em] py-1 " +
                  (active
                    ? "text-ink border-b border-[var(--accent-primary)]"
                    : "text-quiet hover:text-ink")
                }
              >
                {t(h.labelKey)}
              </button>
            );
          })}
        </div>
      </header>

      <p className={"text-[11px] " + (loading ? "text-quiet" : "text-whisper")}>
        {t("dividends.forecast.summary", {
          total: fmtUsd(data.total_usd, 0),
          monthly: fmtUsd(data.monthly_avg_usd, 2),
        })}
        {loading ? t("dividends.forecast.loading_suffix") : ""}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-quiet">
              {([
                "dividends.forecast.col.ticker",
                "dividends.forecast.col.payment",
                "dividends.forecast.col.yield",
                "dividends.forecast.col.yoc",
                "dividends.forecast.col.score",
                "dividends.forecast.col.growth",
              ] as StringKey[]).map((h) => (
                <th
                  key={h}
                  className="py-2 px-3 text-right text-[10px] uppercase tracking-[0.06em] font-medium first:text-left"
                >
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h) => (
              <tr key={h.code} className="border-b border-rule/40 hover:bg-surface-hover">
                <td className="py-3 px-3 align-top">
                  <span className="text-base font-medium text-ink">{h.ticker}</span>
                  <p className="text-[10px] text-quiet">{h.name}</p>
                </td>
                <td className="py-3 px-3 text-right tabular text-ink">
                  {h.payment_12m_usd > 0 ? fmtUsd(h.payment_12m_usd, 2) : "—"}
                </td>
                <td className="py-3 px-3 text-right tabular text-quiet">{fmtPct(h.yield_pct)}</td>
                <td className="py-3 px-3 text-right tabular text-quiet">{fmtPct(h.yield_on_cost_pct)}</td>
                <td className={"py-3 px-3 text-right tabular font-medium " + scoreClass(h.score)}>
                  {h.score == null ? "—" : `${h.score}/6`}
                </td>
                <td className="py-3 px-3 text-right tabular text-quiet">
                  {h.growth_pct == null ? "—" : `${h.growth_pct >= 0 ? "+" : "−"}${Math.abs(h.growth_pct).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

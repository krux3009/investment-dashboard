/**
 * PerformanceChartCard — Holdings tab top-left card. Mirrors SWS's
 * "Value Over Time | Performance Vs Market" card with a 4-KPI metric strip
 * + range tabs + line chart.
 *
 * P2 status:
 *  - "Performance Vs Market" sub-tab renders BenchmarkChart against existing
 *    /api/benchmark data (30 / 90 / 365 day windows supported).
 *  - "Value Over Time" sub-tab renders a placeholder until P5 wires
 *    /api/returns/series (cost-basis vs current value over time).
 *  - YTD / 2Y / All Time range tabs render disabled — backend window not yet
 *    available; ship in P3+.
 */

"use client";

import { useEffect, useState } from "react";
import { fetchBenchmark, type BenchmarkResponse } from "@/lib/api";
import { BenchmarkChart } from "./benchmark-chart";
import { useT } from "@/lib/i18n/use-t";
import { fmtPct, fmtUsd, directionClass } from "@/lib/format";
import type { StringKey } from "@/lib/i18n/strings";

type SubTab = "value" | "vs-market";
type RangeDays = 30 | 90 | 365;
type RangeDisabled = "YTD" | "2Y" | "ALL";

const RANGES: { key: RangeDays | RangeDisabled; labelKey: StringKey; days: RangeDays | null }[] = [
  { key: 30,    labelKey: "portfolio.perf.range.1m",  days: 30 },
  { key: 90,    labelKey: "portfolio.perf.range.3m",  days: 90 },
  { key: "YTD", labelKey: "portfolio.perf.range.ytd", days: null },
  { key: 365,   labelKey: "portfolio.perf.range.1y",  days: 365 },
  { key: "2Y",  labelKey: "portfolio.perf.range.2y",  days: null },
  { key: "ALL", labelKey: "portfolio.perf.range.all", days: null },
];

interface Props {
  initial: BenchmarkResponse | null;
  totalValueUsd: number;
  holdingsCount: number;
  totalPnlAbsUsd: number;
  totalPnlPct: number;
  todayPnlAbsUsd?: number | null;
  todayPnlPct?: number | null;
}

export function PerformanceChartCard({
  initial,
  totalValueUsd,
  holdingsCount,
  totalPnlAbsUsd,
  totalPnlPct,
  todayPnlAbsUsd,
  todayPnlPct,
}: Props) {
  const t = useT();
  const [subTab, setSubTab] = useState<SubTab>("vs-market");
  const initialDays: RangeDays = initial?.days === 30 ? 30 : initial?.days === 365 ? 365 : 90;
  const [days, setDays] = useState<RangeDays>(initialDays);
  const [data, setData] = useState<BenchmarkResponse | null>(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (data && data.days === days) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const next = await fetchBenchmark(days);
        if (!cancelled) setData(next);
      } catch (e) {
        console.warn("PerformanceChartCard benchmark fetch failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, data]);

  const todaySign = todayPnlPct == null ? "flat" : todayPnlPct > 0 ? "pos" : todayPnlPct < 0 ? "neg" : "flat";
  const totalSign = totalPnlPct > 0 ? "pos" : totalPnlPct < 0 ? "neg" : "flat";

  const subTabBtn = (key: SubTab, label: string) => {
    const on = subTab === key;
    return (
      <button
        type="button"
        onClick={() => setSubTab(key)}
        className={[
          "px-3 py-1 rounded-md text-xs transition-colors",
          on ? "bg-surface text-ink font-medium" : "text-quiet hover:text-ink",
        ].join(" ")}
        aria-pressed={on}
      >
        {label}
      </button>
    );
  };

  const rangeBtn = (
    range: (typeof RANGES)[number],
  ) => {
    const disabled = range.days === null;
    const on = !disabled && range.days === days;
    return (
      <button
        key={range.key}
        type="button"
        onClick={() => {
          if (!disabled) setDays(range.days as RangeDays);
        }}
        disabled={disabled}
        className={[
          "px-2 py-1 rounded-md text-[11px] tabular transition-colors",
          on
            ? "bg-surface text-ink font-medium"
            : disabled
              ? "text-whisper cursor-not-allowed"
              : "text-quiet hover:text-ink",
        ].join(" ")}
        aria-pressed={on}
        title={disabled ? "Window not yet available" : undefined}
      >
        {t(range.labelKey)}
      </button>
    );
  };

  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-5 flex flex-col gap-4">
      {/* Sub-tab toggle */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-surface-zebra p-1 rounded-lg">
          {subTabBtn("value", t("portfolio.perf.value_over_time"))}
          {subTabBtn("vs-market", t("portfolio.perf.vs_market"))}
        </div>
        <div className="flex gap-0.5 bg-surface-zebra p-0.5 rounded-md">
          {RANGES.map(rangeBtn)}
        </div>
      </header>

      {/* 4 KPI metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
        <Metric
          label={t("portfolio.perf.total_value")}
          value={fmtUsd(totalValueUsd, { decimals: 0 })}
          sub={t("portfolio.perf.holdings_count", { n: holdingsCount })}
        />
        <Metric
          label={t("portfolio.perf.total_returns")}
          value={fmtUsd(totalPnlAbsUsd, { decimals: 0, signed: true })}
          sub={fmtPct(totalPnlPct, 1)}
          subClass={directionClass(totalPnlPct)}
        />
        <Metric
          label={t("portfolio.perf.1d_returns")}
          value={
            todayPnlAbsUsd == null
              ? "—"
              : fmtUsd(todayPnlAbsUsd, { decimals: 0, signed: true })
          }
          sub={todayPnlPct == null ? undefined : fmtPct(todayPnlPct, 2)}
          subClass={todaySign === "pos" ? "text-[var(--accent-success)]" : todaySign === "neg" ? "text-[var(--accent-danger)]" : "text-quiet"}
        />
        <Metric
          label={t("portfolio.perf.annualised_irr")}
          value="—"
          sub={t("portfolio.kpi.stub_caption")}
          subClass="text-whisper italic"
        />
      </div>

      {/* Chart area */}
      <div className={loading ? "opacity-60 transition-opacity min-h-[200px]" : "min-h-[200px]"}>
        {subTab === "value" ? (
          <ValueOverTimePlaceholder />
        ) : data ? (
          <BenchmarkChart data={data} />
        ) : (
          <div className="text-sm text-whisper italic h-[200px] flex items-center justify-center">
            no benchmark series
          </div>
        )}
      </div>

      {/* Legend */}
      {subTab === "vs-market" && data ? (
        <div className="flex items-center gap-4 text-xs tabular text-quiet">
          <LegendDot color="var(--accent-primary)" label={t("portfolio.perf.legend.portfolio")} />
          {data.benchmarks.map((b) => (
            <LegendDot key={b.symbol} color="var(--quiet)" label={b.symbol} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  subClass,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  subClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-quiet">{label}</span>
      <span className="tabular text-xl font-medium text-ink leading-tight">{value}</span>
      {sub ? (
        <span className={`tabular text-xs ${subClass ?? "text-quiet"}`}>{sub}</span>
      ) : null}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: color }}
      />
      <span className="text-quiet">{label}</span>
    </span>
  );
}

function ValueOverTimePlaceholder() {
  return (
    <div className="h-[200px] flex flex-col items-center justify-center gap-1 border border-dashed border-rule rounded-md">
      <p className="text-xs text-quiet">Cost-basis ledger pending</p>
      <p className="text-[11px] text-whisper italic">P5 — /api/returns/series wires the chart.</p>
    </div>
  );
}

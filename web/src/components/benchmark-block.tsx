"use client";

import { useEffect, useState } from "react";
import {
  fetchBenchmark,
  fetchBenchmarkInsight,
  type BenchmarkInsightResponse,
  type BenchmarkResponse,
} from "@/lib/api";
import { BenchmarkChart } from "./benchmark-chart";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";
import type { StringKey } from "@/lib/i18n/strings";

interface Props {
  initial: BenchmarkResponse;
}

const WINDOWS: { labelKey: StringKey; days: number }[] = [
  { labelKey: "benchmark.window.30d", days: 30 },
  { labelKey: "benchmark.window.90d", days: 90 },
  { labelKey: "benchmark.window.1y", days: 365 },
];

type InsightState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: BenchmarkInsightResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

export function BenchmarkBlock({ initial }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [data, setData] = useState<BenchmarkResponse>(initial);
  const [days, setDays] = useState<number>(initial.days);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [insight, setInsight] = useState<InsightState>({ kind: "idle" });

  useEffect(() => {
    if (days === initial.days) {
      setData(initial);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const next = await fetchBenchmark(days);
        if (!cancelled) setData(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, initial]);

  const symbolsKey = data.symbols.join(",");
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setInsight({ kind: "loading" });
    (async () => {
      const result = await fetchBenchmarkInsight(days, symbolsKey, false, locale);
      if (cancelled) return;
      if (result.ok) {
        setInsight({ kind: "ready", data: result.data });
      } else if (result.status === 503) {
        setInsight({ kind: "unavailable", detail: result.detail });
      } else {
        setInsight({ kind: "error", detail: result.detail });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, days, symbolsKey, locale]);

  useEffect(() => {
    setExpanded(false);
    setInsight({ kind: "idle" });
  }, [days]);

  const portfolioFinal = data.portfolio.at(-1)?.pct ?? 0;

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs uppercase tracking-[0.06em] text-quiet">
          {t("benchmark.heading_lead")} <span className="text-ink">{data.symbols.join(" · ")}</span> ·{" "}
          <span className="text-ink">{t("benchmark.days_suffix", { n: data.days })}</span>
        </h2>
        <div className="flex gap-1 text-xs">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              onClick={() => setDays(w.days)}
              className={`px-2 py-1 rounded-sm tabular ${
                days === w.days
                  ? "text-ink border border-rule"
                  : "text-quiet hover:text-ink"
              }`}
            >
              {t(w.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className={loading ? "opacity-60 transition-opacity" : ""}>
        <BenchmarkChart data={data} />
      </div>

      <div className="flex items-baseline justify-between mt-2 text-xs tabular">
        <div className="flex gap-4 text-quiet">
          <span>
            <span className="text-ink">{t("benchmark.legend.portfolio")}</span>{" "}
            {(portfolioFinal * 100).toFixed(2)}%
          </span>
          {data.benchmarks.map((b) => {
            const final = b.points.at(-1)?.pct ?? 0;
            return (
              <span key={b.symbol}>
                {b.symbol} {(final * 100).toFixed(2)}%
              </span>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-quiet hover:text-ink"
        >
          {expanded ? t("common.hide") : t("common.learn_more")}
        </button>
      </div>

      <div className="text-xs text-whisper italic mt-1">
        {data.weighting_caveat}
      </div>

      {expanded && (
        <div className="mt-4 bg-surface-raised border border-rule rounded-sm px-4 py-3">
          {insight.kind === "loading" && (
            <div role="status" aria-label={t("common.drafting_commentary")} className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-[5rem_1fr] gap-x-3 items-center">
                  <div className="h-3 w-16 rounded bg-rule/40 animate-pulse" />
                  <div className="h-4 w-full rounded bg-rule/40 animate-pulse" />
                </div>
              ))}
            </div>
          )}
          {insight.kind === "unavailable" && (
            <div className="text-sm text-whisper italic">{insight.detail}</div>
          )}
          {insight.kind === "error" && (
            <div className="text-sm text-loss">
              {t("common.commentary_unavailable", { detail: insight.detail })}
            </div>
          )}
          {insight.kind === "ready" && (
            <dl className="flex flex-col gap-3 text-sm leading-[1.65]">
              {insight.data.what && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">{t("common.what")}</dt>
                  <dd className="text-ink">{insight.data.what}</dd>
                </div>
              )}
              {insight.data.meaning && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">{t("common.meaning")}</dt>
                  <dd className="text-ink">{insight.data.meaning}</dd>
                </div>
              )}
              {insight.data.watch && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">{t("common.watch")}</dt>
                  <dd className="text-ink">{insight.data.watch}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}

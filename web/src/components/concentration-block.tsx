"use client";

import { useEffect, useState } from "react";
import {
  fetchConcentrationInsight,
  type ConcentrationInsightResponse,
  type ConcentrationResponse,
} from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";

interface Props {
  initial: ConcentrationResponse;
}

type InsightState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: ConcentrationInsightResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

interface Segment {
  label: string;
  pct: number;
  // "rest" renders fainter — it means "everything else", not a position.
  muted?: boolean;
}

// One graphite tone for every named segment, separated by 2px surface gaps
// (gap-0.5). The old darkest-to-lightest ramp colored segments by *rank*, so
// a holding that overtook another swapped colors between visits, and the
// palest steps dropped below 2:1 against the surface. Width + the ordered
// label row underneath carry the identity; color no longer re-encodes size.
function StackedBar({
  segments,
  ariaLabel,
}: {
  segments: Segment[];
  ariaLabel: string;
}) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex gap-0.5 h-4 w-full rounded-sm overflow-hidden"
    >
      {segments.map((seg, i) => (
        <div
          key={`${seg.label}-${i}`}
          className="h-full"
          style={{
            width: `${Math.max(seg.pct * 100, 0.25)}%`,
            background: seg.muted ? "var(--rule)" : "var(--quiet)",
          }}
          title={`${seg.label} · ${(seg.pct * 100).toFixed(1)}%`}
        />
      ))}
    </div>
  );
}

export function ConcentrationBlock({ initial }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [insight, setInsight] = useState<InsightState>({ kind: "idle" });

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setInsight({ kind: "loading" });
    (async () => {
      const result = await fetchConcentrationInsight(false, locale);
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
  }, [expanded, locale]);

  if (initial.count === 0) return null;

  const restPct = Math.max(0, 1 - initial.top_names.reduce((s, n) => s + n.pct, 0));
  const segments: Segment[] = [
    ...initial.top_names.map((n) => ({ label: n.ticker, pct: n.pct })),
  ];
  if (restPct > 0.001) segments.push({ label: "rest", pct: restPct, muted: true });

  const ccyEntries = Object.entries(initial.currency_exposure).sort(
    ([, a], [, b]) => b - a,
  );
  const ccySegments: Segment[] = ccyEntries.map(([ccy, pct]) => ({
    label: ccy,
    pct,
  }));

  return (
    <section className="my-12">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs uppercase tracking-[0.06em] text-quiet">
          {t("concentration.heading")}
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-quiet hover:text-ink"
        >
          {expanded ? t("common.hide") : t("common.learn_more")}
        </button>
      </div>

      <div className="flex gap-6 text-xs tabular text-quiet mb-4">
        <span>
          {t("concentration.top_n", { n: 1 })} ·{" "}
          <span className="text-ink">{(initial.top1_pct * 100).toFixed(1)}%</span>
        </span>
        <span>
          {t("concentration.top_n", { n: 3 })} ·{" "}
          <span className="text-ink">{(initial.top3_pct * 100).toFixed(1)}%</span>
        </span>
        <span>
          {t("concentration.top_n", { n: 5 })} ·{" "}
          <span className="text-ink">{(initial.top5_pct * 100).toFixed(1)}%</span>
        </span>
        <span>
          {t("concentration.holdings")} · <span className="text-ink">{initial.count}</span>
        </span>
      </div>

      <StackedBar
        segments={segments}
        ariaLabel={t("concentration.aria.position_weights")}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular text-quiet mt-2">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-baseline gap-1.5">
            <span className="text-ink">{s.label}</span>
            <span>{(s.pct * 100).toFixed(1)}%</span>
          </span>
        ))}
      </div>

      <div className="mt-5">
        <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-2">
          {t("concentration.currency_exposure")}
        </div>
        <StackedBar
          segments={ccySegments}
          ariaLabel={t("concentration.aria.currency_exposure")}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular text-quiet mt-2">
          {ccySegments.map((s) => (
            <span key={s.label} className="inline-flex items-baseline gap-1.5">
              <span className="text-ink">{s.label}</span>
              <span>{(s.pct * 100).toFixed(1)}%</span>
            </span>
          ))}
        </div>
      </div>

      {initial.single_name_max && (
        <div className="text-xs text-quiet mt-4 tabular">
          {t("concentration.largest_position")} ·{" "}
          <span className="text-ink">{initial.single_name_max.ticker}</span> ·{" "}
          <span className="text-ink">
            {(initial.single_name_max.pct * 100).toFixed(1)}%
          </span>
        </div>
      )}

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

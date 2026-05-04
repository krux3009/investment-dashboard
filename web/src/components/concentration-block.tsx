"use client";

import { useEffect, useState } from "react";
import {
  fetchConcentrationInsight,
  type ConcentrationInsightResponse,
  type ConcentrationResponse,
} from "@/lib/api";

interface Props {
  initial: ConcentrationResponse;
}

type InsightState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: ConcentrationInsightResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

const SLICE_VARS = [
  "var(--slice-1)",
  "var(--slice-2)",
  "var(--slice-3)",
  "var(--slice-4)",
  "var(--slice-5)",
  "var(--slice-6)",
];

const BAR_W = 600;
const BAR_H = 16;

interface Segment {
  label: string;
  pct: number;
}

function StackedBar({
  segments,
  ariaLabel,
}: {
  segments: Segment[];
  ariaLabel: string;
}) {
  let cursor = 0;
  return (
    <svg
      viewBox={`0 0 ${BAR_W} ${BAR_H}`}
      width="100%"
      height={BAR_H}
      role="img"
      aria-label={ariaLabel}
      className="block"
    >
      {segments.map((seg, i) => {
        const w = seg.pct * BAR_W;
        const x = cursor;
        cursor += w;
        return (
          <rect
            key={`${seg.label}-${i}`}
            x={x}
            y={0}
            width={Math.max(w, 0.5)}
            height={BAR_H}
            fill={SLICE_VARS[i % SLICE_VARS.length]}
            stroke="var(--surface)"
            strokeWidth={0.75}
          >
            <title>{`${seg.label} · ${(seg.pct * 100).toFixed(1)}%`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function ConcentrationBlock({ initial }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [insight, setInsight] = useState<InsightState>({ kind: "idle" });

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setInsight({ kind: "loading" });
    (async () => {
      const result = await fetchConcentrationInsight();
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
  }, [expanded]);

  if (initial.count === 0) return null;

  const restPct = Math.max(0, 1 - initial.top_names.reduce((s, n) => s + n.pct, 0));
  const segments: Segment[] = [
    ...initial.top_names.map((n) => ({ label: n.ticker, pct: n.pct })),
  ];
  if (restPct > 0.001) segments.push({ label: "rest", pct: restPct });

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
        <h2 className="text-sm font-medium tracking-wide text-ink">
          Shape of the book
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-quiet hover:text-ink"
        >
          {expanded ? "[hide]" : "[learn more]"}
        </button>
      </div>

      <div className="flex gap-6 text-xs tabular text-quiet mb-4">
        <span>
          Top 1 ·{" "}
          <span className="text-ink">{(initial.top1_pct * 100).toFixed(1)}%</span>
        </span>
        <span>
          Top 3 ·{" "}
          <span className="text-ink">{(initial.top3_pct * 100).toFixed(1)}%</span>
        </span>
        <span>
          Top 5 ·{" "}
          <span className="text-ink">{(initial.top5_pct * 100).toFixed(1)}%</span>
        </span>
        <span>
          Holdings · <span className="text-ink">{initial.count}</span>
        </span>
      </div>

      <StackedBar
        segments={segments}
        ariaLabel="Position weights stacked by descending share"
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
          Currency exposure
        </div>
        <StackedBar
          segments={ccySegments}
          ariaLabel="Currency exposure as USD share"
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
          Largest position ·{" "}
          <span className="text-ink">{initial.single_name_max.ticker}</span> ·{" "}
          <span className="text-ink">
            {(initial.single_name_max.pct * 100).toFixed(1)}%
          </span>
        </div>
      )}

      {expanded && (
        <div className="mt-4 bg-surface-raised border border-rule rounded-sm px-4 py-3">
          {insight.kind === "loading" && (
            <div role="status" aria-label="Drafting commentary…" className="flex flex-col gap-3">
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
            <div className="text-sm text-loss">commentary unavailable: {insight.detail}</div>
          )}
          {insight.kind === "ready" && (
            <dl className="flex flex-col gap-3 text-sm leading-[1.65]">
              {insight.data.what && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">What</dt>
                  <dd className="text-ink">{insight.data.what}</dd>
                </div>
              )}
              {insight.data.meaning && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">Meaning</dt>
                  <dd className="text-ink">{insight.data.meaning}</dd>
                </div>
              )}
              {insight.data.watch && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">Watch</dt>
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

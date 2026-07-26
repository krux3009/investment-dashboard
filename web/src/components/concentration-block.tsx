"use client";

import { type ConcentrationResponse } from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  initial: ConcentrationResponse;
}

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
  const t = useT();

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
        <h2 className="text-xs uppercase tracking-[0.06em] text-quiet">
          {t("concentration.heading")}
        </h2>
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

    </section>
  );
}

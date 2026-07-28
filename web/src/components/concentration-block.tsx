"use client";

import { type ConcentrationResponse } from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  initial: ConcentrationResponse;
}

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
            // slice-7 is the lightest ramp step that still clears 2:1 vs the
            // surface — rule sat at ~1.4:1 and the segment could vanish.
            background: seg.muted ? "var(--slice-7)" : "var(--quiet)",
          }}
          title={`${seg.label} · ${(seg.pct * 100).toFixed(1)}%`}
        />
      ))}
    </div>
  );
}

export function ConcentrationBlock({ initial }: Props) {
  const t = useT();

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

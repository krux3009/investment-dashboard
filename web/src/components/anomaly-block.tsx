"use client";

import type { AnomalyItem } from "@/lib/api";

interface Props {
  items: AnomalyItem[];
  loading: boolean;
  error: string | null;
}

// Renders the technical + capital-flow anomaly content as quiet prose.
// Each non-empty category gets a small uppercase label + the moomoo
// English copy verbatim. Absence-as-signal: missing categories don't
// render placeholders.
export function AnomalyBlock({ items, loading, error }: Props) {
  if (loading) {
    return (
      <div className="text-sm text-quiet italic">loading anomalies…</div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-loss">
        could not load anomalies: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-whisper italic">
        no anomalies in the last 7 days.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {items.map((item) => (
        <div key={item.kind}>
          <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-1.5">
            {item.label}
          </div>
          <div className="text-sm text-ink leading-relaxed whitespace-pre-line">
            {item.content}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import type { AnomalyItem } from "@/lib/api";

interface Props {
  items: AnomalyItem[];
  // Window the backend looked across; surfaces in absence captions.
  timeRange: number;
  loading: boolean;
  error: string | null;
}

// Renders the technical + capital-flow anomaly content as quiet prose.
// Each category gets a small uppercase label. Categories with content
// render the moomoo English copy verbatim; categories that returned no
// anomaly fire a quiet "none in the last N days" caption so the reader
// knows the search ran rather than wondering whether the section is
// just hidden.
export function AnomalyBlock({ items, timeRange, loading, error }: Props) {
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
        no anomalies in the last {timeRange} days.
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
          {item.content ? (
            <div className="text-sm text-ink leading-relaxed whitespace-pre-line">
              {item.content}
            </div>
          ) : (
            <div className="text-sm text-whisper italic">
              none in the last {timeRange} days.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

"use client";

import type { AnomalyItem } from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";

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
// anomaly fire a quiet caption so the reader knows the search ran
// rather than wondering whether the section is just hidden.
export function AnomalyBlock({ items, timeRange, loading, error }: Props) {
  const t = useT();

  if (loading) {
    return (
      <div className="text-sm text-quiet italic">{t("anomaly.loading")}</div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-loss">
        {t("anomaly.load_failed", { detail: error })}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-sm text-whisper italic">
        {t("anomaly.none", { n: timeRange })}
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
              {t("anomaly.none_in_kind", { n: timeRange })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

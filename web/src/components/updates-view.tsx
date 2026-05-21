"use client";

/**
 * Client presentation layer for the /portfolio Updates tab. The tab
 * (updates-tab.tsx) is a SERVER component doing the data fetch; this view
 * holds the header chrome + unavailable state so it can call useT() for
 * live language toggle. The ForesightBlock itself is already a client
 * component with its own i18n.
 */

import type { ForesightResponse } from "@/lib/api";
import { ForesightBlock } from "@/components/foresight-block";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  foresight: ForesightResponse | null;
}

export function UpdatesView({ foresight }: Props) {
  const t = useT();

  if (!foresight) {
    return (
      <section className="rounded-xl border border-dashed border-rule bg-surface-raised p-10 text-center">
        <p className="text-sm font-medium text-ink">{t("updates.unavailable")}</p>
        <p className="mt-2 text-xs text-quiet">{t("updates.backend_unreachable")}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-medium text-ink">{t("updates.heading")}</h2>
          <p className="text-xs text-quiet">{t("updates.description")}</p>
        </div>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">
          {t("updates.events_count", { n: foresight.events.length })}
        </p>
      </header>
      <ForesightBlock initial={foresight} />
    </div>
  );
}

"use client";

/**
 * 5 axis sub-tabs for /portfolio Analysis: Valuation (default) /
 * Future / Past / Health / Dividends. Only Valuation has data right
 * now — the other four route the reader to drill-in statement cards
 * via the per-row snowflake (P6).
 */

import { useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/use-t";
import type { StringKey } from "@/lib/i18n/strings";

type AxisKey = "valuation" | "future" | "past" | "health" | "dividends";

const TABS: { key: AxisKey; labelKey: StringKey }[] = [
  { key: "valuation", labelKey: "analysis.tab.valuation" },
  { key: "future", labelKey: "analysis.tab.future" },
  { key: "past", labelKey: "analysis.tab.past" },
  { key: "health", labelKey: "analysis.tab.health" },
  { key: "dividends", labelKey: "analysis.tab.dividends" },
];

interface Props {
  valuationCards: ReactNode;
}

export function AnalysisSubTabs({ valuationCards }: Props) {
  const t = useT();
  const [active, setActive] = useState<AxisKey>("valuation");

  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-ink">{t("analysis.subtabs.heading")}</h2>
        <p className="text-xs text-quiet">{t("analysis.subtabs.subhead")}</p>
      </header>

      <nav className="flex items-baseline gap-5 border-b border-rule">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={
                "relative text-sm font-medium py-2 transition-colors " +
                (isActive ? "text-ink" : "text-quiet hover:text-ink")
              }
            >
              {t(tab.labelKey)}
              {isActive ? (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-[var(--accent-primary)]" />
              ) : null}
            </button>
          );
        })}
      </nav>

      <div>
        {active === "valuation" ? (
          valuationCards
        ) : (
          <PlaceholderAxis axis={active} />
        )}
      </div>
    </section>
  );
}

function PlaceholderAxis({ axis }: { axis: AxisKey }) {
  const t = useT();
  const LABELS: Record<AxisKey, { titleKey: StringKey; explainKey: StringKey | null }> = {
    valuation: { titleKey: "analysis.tab.valuation", explainKey: null },
    future: {
      titleKey: "analysis.placeholder.future.title",
      explainKey: "analysis.placeholder.future.explain",
    },
    past: {
      titleKey: "analysis.placeholder.past.title",
      explainKey: "analysis.placeholder.past.explain",
    },
    health: {
      titleKey: "analysis.placeholder.health.title",
      explainKey: "analysis.placeholder.health.explain",
    },
    dividends: {
      titleKey: "analysis.placeholder.dividends.title",
      explainKey: "analysis.placeholder.dividends.explain",
    },
  };
  const meta = LABELS[axis];
  return (
    <div className="rounded-lg border border-dashed border-rule bg-surface p-8 text-center flex flex-col gap-2">
      <p className="text-sm font-medium text-ink">{t(meta.titleKey)}</p>
      <p className="text-xs text-quiet max-w-[48ch] mx-auto">
        {meta.explainKey ? t(meta.explainKey) : ""}
      </p>
    </div>
  );
}

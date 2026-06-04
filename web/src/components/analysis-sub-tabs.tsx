"use client";

/**
 * 5 axis sub-tabs for /portfolio Analysis: Valuation (default) /
 * Future / Past / Health / Dividends. All five carry portfolio-level
 * content as of v5 — the per-axis card sets are built in
 * analysis-view.tsx and passed in as slots.
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
  futureCards: ReactNode;
  pastCards: ReactNode;
  healthCards: ReactNode;
  dividendsCards: ReactNode;
}

export function AnalysisSubTabs({
  valuationCards,
  futureCards,
  pastCards,
  healthCards,
  dividendsCards,
}: Props) {
  const t = useT();
  const [active, setActive] = useState<AxisKey>("valuation");

  const slots: Record<AxisKey, ReactNode> = {
    valuation: valuationCards,
    future: futureCards,
    past: pastCards,
    health: healthCards,
    dividends: dividendsCards,
  };

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

      <div>{slots[active]}</div>
    </section>
  );
}

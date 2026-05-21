"use client";

/**
 * 5 axis sub-tabs for /portfolio Analysis: Valuation (default) /
 * Future / Past / Health / Dividends. Only Valuation has data right
 * now — the other four route the reader to drill-in statement cards
 * via the per-row snowflake (P6).
 */

import { useState, type ReactNode } from "react";

type AxisKey = "valuation" | "future" | "past" | "health" | "dividends";

const TABS: { key: AxisKey; label: string }[] = [
  { key: "valuation", label: "Valuation" },
  { key: "future", label: "Future" },
  { key: "past", label: "Past" },
  { key: "health", label: "Health" },
  { key: "dividends", label: "Dividends" },
];

interface Props {
  valuationCards: ReactNode;
}

export function AnalysisSubTabs({ valuationCards }: Props) {
  const [active, setActive] = useState<AxisKey>("valuation");

  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-ink">Key Metrics & Benchmarks</h2>
        <p className="text-xs text-quiet">
          Five snowflake axes. Valuation has portfolio-wide gauges below;
          the other four surface per-holding statement cards inside the
          row drill-ins.
        </p>
      </header>

      <nav className="flex items-baseline gap-5 border-b border-rule">
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={
                "relative text-sm font-medium py-2 transition-colors " +
                (isActive ? "text-ink" : "text-quiet hover:text-ink")
              }
            >
              {t.label}
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
  const LABELS: Record<AxisKey, { title: string; explain: string }> = {
    valuation: { title: "Valuation", explain: "" },
    future: {
      title: "Future Growth",
      explain:
        "Forecasted earnings + revenue growth land here once an analyst-forecast feed is wired (P5+).",
    },
    past: {
      title: "Past Performance",
      explain:
        "Per-axis statements live in each row's drill-in: expand a holding from Holdings to read its past statements.",
    },
    health: {
      title: "Financial Health",
      explain:
        "Per-axis statements live in each row's drill-in: expand a holding from Holdings to read its health statements.",
    },
    dividends: {
      title: "Dividends",
      explain:
        "Portfolio-wide dividend metrics live in the Dividends tab; per-holding score lands in the Holdings row drill-in.",
    },
  };
  const meta = LABELS[axis];
  return (
    <div className="rounded-lg border border-dashed border-rule bg-surface p-8 text-center flex flex-col gap-2">
      <p className="text-sm font-medium text-ink">{meta.title}</p>
      <p className="text-xs text-quiet max-w-[48ch] mx-auto">{meta.explain}</p>
    </div>
  );
}

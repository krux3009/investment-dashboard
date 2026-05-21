"use client";

// P6 — per-stock 5-axis snowflake + statement-card grid. Lives inside the
// holdings / watchlist drill-in, between the price chart and the insight
// column. Lazy-fetched on row expand; backend caches 6h.
//
// Five axes in SWS order (Value → Future → Past → Health → Dividend). The
// backend ships deterministic 0-6 scores for Past / Health / Dividend plus
// Claude statement bullets; Valuation + Future stay null until the peer-PE /
// analyst-forecast data layers land, so they render as greyed "not yet
// available" stubs. The pentagon always renders — even without an Anthropic
// key the deterministic scores draw the shape, statements just collapse.

import { useEffect, useState } from "react";
import { fetchSnowflake, type SnowflakeResponse, type SnowflakeStatement } from "@/lib/api";
import { Snowflake } from "./snowflake";
import { StatementCard, type StatementCategory } from "./statement-card";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";
import type { StringKey } from "@/lib/i18n/strings";

interface Props {
  code: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: SnowflakeResponse }
  | { kind: "error"; detail: string };

// Axis descriptor: ties the snowflake score key, the statements key, the
// StatementCard category, and the i18n label together. Order matches SWS.
const AXES: Array<{
  scoreKey: keyof SnowflakeResponse["scores"];
  stmtKey: keyof SnowflakeResponse["statements"] | null;
  category: StatementCategory;
  labelKey: StringKey;
}> = [
  { scoreKey: "valuation", stmtKey: null, category: "valuation", labelKey: "drillin.axis.valuation" },
  { scoreKey: "future", stmtKey: null, category: "future", labelKey: "drillin.axis.future" },
  { scoreKey: "past", stmtKey: "past", category: "past", labelKey: "drillin.axis.past" },
  { scoreKey: "health", stmtKey: "health", category: "health", labelKey: "drillin.axis.health" },
  { scoreKey: "dividends", stmtKey: "dividend", category: "dividend", labelKey: "drillin.axis.dividend" },
];

function Header({ label }: { label: string }) {
  return (
    <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
      {label}
    </div>
  );
}

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) return null;
  return (
    <span className="tabular rounded-full border border-rule px-2 py-0.5 text-[11px] font-medium text-ink">
      {score}/6
    </span>
  );
}

function AxisCluster({
  label,
  score,
  statements,
  category,
  pendingLabel,
}: {
  label: string;
  score: number | null;
  statements: SnowflakeStatement[] | null;
  category: StatementCategory;
  pendingLabel: string;
}) {
  const greyed = score == null && (!statements || statements.length === 0);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h4
          className={
            greyed ? "text-sm font-medium text-quiet" : "text-sm font-medium text-ink"
          }
        >
          {label}
        </h4>
        <ScoreChip score={score} />
      </div>
      {greyed ? (
        <p className="text-xs text-whisper italic">{pendingLabel}</p>
      ) : statements && statements.length > 0 ? (
        <div className="flex flex-col gap-2">
          {statements.map((s, i) => (
            <StatementCard
              key={`${category}-${i}`}
              icon={s.icon}
              category={category}
              headline={s.headline}
              sub={s.sub ?? undefined}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SnowflakeStatements({ code }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const data = await fetchSnowflake(code, locale);
        if (!cancelled) setState({ kind: "ready", data });
      } catch (e) {
        if (!cancelled) setState({ kind: "error", detail: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, locale]);

  const heading = t("drillin.snowflake_heading");

  if (state.kind === "loading") {
    return (
      <div>
        <Header label={heading} />
        <div className="text-sm text-quiet italic h-[120px] flex items-center">
          {t("drillin.snowflake_loading")}
        </div>
      </div>
    );
  }

  // On a hard fetch error, render nothing rather than a red bar — the rest of
  // the drill-in (chart, insight, anomalies) stays useful.
  if (state.kind === "error") return null;

  const { scores, statements, available } = state.data;
  const pendingLabel = t("drillin.axis_pending");

  return (
    <div>
      <Header label={heading} />
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 items-start">
        <div className="flex justify-center lg:justify-start">
          <Snowflake scores={scores} size={240} showLabels showRings />
        </div>
        {available ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {AXES.map((axis) => (
              <AxisCluster
                key={axis.scoreKey}
                label={t(axis.labelKey)}
                score={scores[axis.scoreKey] ?? null}
                statements={axis.stmtKey ? statements[axis.stmtKey] : null}
                category={axis.category}
                pendingLabel={pendingLabel}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-whisper italic self-center">
            {t("drillin.snowflake_unavailable")}
          </p>
        )}
      </div>
    </div>
  );
}

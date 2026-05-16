"use client";

import type { ForesightInsightResponse } from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";

export type InsightState =
  | { kind: "loading" }
  | { kind: "ready"; data: ForesightInsightResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

interface Props {
  insight: InsightState | undefined;
}

export function ForesightInsightBody({ insight }: Props) {
  const t = useT();

  if (!insight || insight.kind === "loading") {
    return (
      <div
        role="status"
        aria-label={t("common.drafting_commentary")}
        className="flex flex-col gap-2 max-w-[60ch]"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[5rem_1fr] gap-x-3 items-center"
          >
            <div className="h-3 w-16 rounded bg-rule/40 animate-pulse" />
            <div className="h-4 w-full rounded bg-rule/40 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (insight.kind === "unavailable") {
    return <p className="text-sm text-whisper italic">{insight.detail}</p>;
  }

  if (insight.kind === "error") {
    return (
      <p className="text-sm text-loss">
        {t("common.commentary_unavailable", { detail: insight.detail })}
      </p>
    );
  }

  return (
    <dl className="flex flex-col gap-2 text-sm leading-[1.6] max-w-[60ch]">
      {insight.data.what && (
        <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
          <dt className="text-xs uppercase tracking-wide text-quiet">
            {t("common.what")}
          </dt>
          <dd className="text-ink">{insight.data.what}</dd>
        </div>
      )}
      {insight.data.meaning && (
        <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
          <dt className="text-xs uppercase tracking-wide text-quiet">
            {t("common.meaning")}
          </dt>
          <dd className="text-ink">{insight.data.meaning}</dd>
        </div>
      )}
      {insight.data.watch && (
        <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
          <dt className="text-xs uppercase tracking-wide text-quiet">
            {t("common.watch")}
          </dt>
          <dd className="text-ink">{insight.data.watch}</dd>
        </div>
      )}
    </dl>
  );
}

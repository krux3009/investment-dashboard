"use client";

// Per-stock educational insight block. Lives inside the holdings
// drill-in alongside the price chart and anomaly content. Lazy-fetched
// when the row is expanded; cached server-side for 6h. The daily digest
// up top stays as short summaries; deeper teaching about ONE ticker
// happens here.

import { useEffect, useState } from "react";
import { fetchInsight, type InsightResponse } from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";

interface Props {
  code: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: InsightResponse }
  | { kind: "absent" }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

function Header({ label }: { label: string }) {
  return (
    <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
      {label}
    </div>
  );
}

// Action chip tone → status color. Mirrors statement-card.tsx ICON_CLASS:
// 18% tinted background, full-saturation text + border.
const TONE_CLASS: Record<InsightResponse["action_tone"], string> = {
  positive:
    "bg-[color-mix(in_oklch,var(--accent-success)_18%,transparent)] text-[var(--accent-success)] border-[var(--accent-success)]",
  caution:
    "bg-[color-mix(in_oklch,var(--accent-warn)_18%,transparent)] text-[var(--accent-warn)] border-[var(--accent-warn)]",
  neutral: "bg-transparent text-ink border-rule",
};

// Confidence chip: High = success, Medium = gold, Low = quiet.
const CONFIDENCE_CLASS: Record<string, string> = {
  High: "text-[var(--accent-success)] border-[var(--accent-success)]",
  Medium: "text-[var(--accent-primary)] border-[var(--accent-primary)]",
  Low: "text-quiet border-rule",
};

export function InsightBlock({ code }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [state, setState] = useState<State>({ kind: "loading" });
  const headerLabel = t("insight.heading");

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      const result = await fetchInsight(code, false, locale);
      if (cancelled) return;
      if (result.ok) {
        if (result.data === null) setState({ kind: "absent" });
        else setState({ kind: "ready", data: result.data });
      } else if (result.status === 503) {
        setState({ kind: "unavailable", detail: result.detail });
      } else {
        setState({ kind: "error", detail: result.detail });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, locale]);

  // Watchlist rows that aren't held positions: render nothing rather than
  // a red error. The drill-in still shows the price chart + technicals.
  if (state.kind === "absent") return null;

  if (state.kind === "loading") {
    return (
      <div>
        <Header label={headerLabel} />
        <dl
          role="status"
          aria-label={t("insight.drafting")}
          className="flex flex-col gap-3"
        >
          {[0, 1].map((i) => (
            <div
              key={i}
              className="grid grid-cols-[5rem_1fr] gap-x-3 items-center"
            >
              <div className="h-3 w-14 rounded bg-rule/40 animate-pulse" />
              <div className="h-4 w-full rounded bg-rule/40 animate-pulse" />
            </div>
          ))}
        </dl>
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div>
        <Header label={headerLabel} />
        <div className="text-sm text-whisper italic">{state.detail}</div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div>
        <Header label={headerLabel} />
        <div className="text-sm text-loss">
          {t("common.insight_unavailable", { detail: state.detail })}
        </div>
      </div>
    );
  }

  const { action, action_tone, why, confidence, risk } = state.data;
  if (!action && !why) return null;
  const confidenceLabel =
    confidence === "High"
      ? t("confidence.high")
      : confidence === "Low"
        ? t("confidence.low")
        : t("confidence.medium");
  return (
    <div>
      <Header label={headerLabel} />
      {/* Action + Confidence chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {action && (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium ${TONE_CLASS[action_tone] ?? TONE_CLASS.neutral}`}
          >
            {action}
          </span>
        )}
        {confidence && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${CONFIDENCE_CLASS[confidence] ?? CONFIDENCE_CLASS.Low}`}
          >
            <span className="uppercase tracking-wide text-quiet">
              {t("common.confidence")}
            </span>
            {confidenceLabel}
          </span>
        )}
      </div>
      <dl className="flex flex-col gap-3 text-sm leading-[1.65]">
        {why && (
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
            <dt className="text-xs uppercase tracking-wide text-quiet">
              {t("common.why")}
            </dt>
            <dd className="text-ink">{why}</dd>
          </div>
        )}
        {risk && (
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
            <dt className="text-xs uppercase tracking-wide text-quiet">
              {t("common.risk")}
            </dt>
            <dd className="text-quiet">{risk}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  fetchForesight,
  fetchForesightInsight,
  type ForesightEvent,
  type ForesightInsightResponse,
  type ForesightKind,
  type ForesightResponse,
} from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";
import type { StringKey } from "@/lib/i18n/strings";

interface Props {
  initial: ForesightResponse;
}

const WINDOWS: { labelKey: StringKey; days: number }[] = [
  { labelKey: "foresight.window.7d", days: 7 },
  { labelKey: "foresight.window.30d", days: 30 },
];

const KIND_LABEL_KEY: Record<ForesightKind, StringKey> = {
  earnings: "foresight.kind.earnings",
  macro: "foresight.kind.macro",
  company_event: "foresight.kind.company_event",
};

type InsightState =
  | { kind: "loading" }
  | { kind: "ready"; data: ForesightInsightResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

function formatDate(iso: string, locale: "en" | "zh"): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(
    locale === "zh" ? "zh-CN" : "en-US",
    { weekday: "short", month: "short", day: "numeric" },
  );
}

interface RowProps {
  event: ForesightEvent;
  days: number;
  expanded: boolean;
  onToggle: () => void;
  insight: InsightState | undefined;
}

function EventRow({ event, days, expanded, onToggle, insight }: RowProps) {
  const t = useT();
  const { locale } = useLocale();
  const daysUntilLabel =
    event.days_until === 0
      ? t("foresight.days_until.today")
      : event.days_until === 1
        ? t("foresight.days_until.tomorrow")
        : t("foresight.days_until.in_days", { n: event.days_until });

  return (
    <div className="py-3 border-b border-rule/60 last:border-b-0">
      <div className="grid grid-cols-[7rem_5rem_1fr_auto] gap-x-4 items-baseline">
        <div className="tabular text-sm">
          <div className="text-ink">{formatDate(event.date, locale)}</div>
          <div className="text-xs text-whisper">{daysUntilLabel}</div>
        </div>
        <div className="text-xs uppercase tracking-[0.06em] text-quiet">
          <div>{t(KIND_LABEL_KEY[event.kind])}</div>
          {event.ticker && (
            <div className="font-mono text-[11px] text-ink mt-0.5">
              {event.ticker}
            </div>
          )}
        </div>
        <div className="text-sm">
          <div className="text-ink">{event.label}</div>
          <div className="text-xs text-quiet leading-[1.5] mt-0.5">
            {event.description}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-quiet hover:text-ink whitespace-nowrap"
        >
          {expanded ? t("common.hide") : t("common.learn_more")}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 ml-[7rem] pl-4 border-l border-rule/60">
          {(!insight || insight.kind === "loading") && (
            <div role="status" aria-label={t("common.drafting_commentary")} className="flex flex-col gap-2 max-w-[60ch]">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-[5rem_1fr] gap-x-3 items-center">
                  <div className="h-3 w-16 rounded bg-rule/40 animate-pulse" />
                  <div className="h-4 w-full rounded bg-rule/40 animate-pulse" />
                </div>
              ))}
            </div>
          )}
          {insight?.kind === "unavailable" && (
            <p className="text-sm text-whisper italic">{insight.detail}</p>
          )}
          {insight?.kind === "error" && (
            <p className="text-sm text-loss">
              {t("common.commentary_unavailable", { detail: insight.detail })}
            </p>
          )}
          {insight?.kind === "ready" && (
            <dl className="flex flex-col gap-2 text-sm leading-[1.6] max-w-[60ch]">
              {insight.data.what && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">{t("common.what")}</dt>
                  <dd className="text-ink">{insight.data.what}</dd>
                </div>
              )}
              {insight.data.meaning && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">{t("common.meaning")}</dt>
                  <dd className="text-ink">{insight.data.meaning}</dd>
                </div>
              )}
              {insight.data.watch && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">{t("common.watch")}</dt>
                  <dd className="text-ink">{insight.data.watch}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

export function ForesightBlock({ initial }: Props) {
  const t = useT();
  const [data, setData] = useState<ForesightResponse>(initial);
  const [days, setDays] = useState<number>(initial.days);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [insightById, setInsightById] = useState<Record<string, InsightState>>({});

  useEffect(() => {
    if (days === initial.days) {
      setData(initial);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const next = await fetchForesight(days);
        if (!cancelled) setData(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, initial]);

  useEffect(() => {
    setExpanded({});
  }, [days]);

  function toggle(eventId: string) {
    setExpanded((prev) => {
      const next = { ...prev, [eventId]: !prev[eventId] };
      if (next[eventId] && !insightById[eventId]) {
        void load(eventId);
      }
      return next;
    });
  }

  async function load(eventId: string) {
    setInsightById((s) => ({ ...s, [eventId]: { kind: "loading" } }));
    const result = await fetchForesightInsight(eventId, days);
    setInsightById((s) => ({
      ...s,
      [eventId]: result.ok
        ? { kind: "ready", data: result.data }
        : result.status === 503
          ? { kind: "unavailable", detail: result.detail }
          : { kind: "error", detail: result.detail },
    }));
  }

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs uppercase tracking-[0.06em] text-quiet">
          {t("foresight.heading_lead")}{" "}
          <span className="text-ink">{t("foresight.days_suffix", { n: data.days })}</span>
        </h2>
        <div className="flex gap-1 text-xs">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              onClick={() => setDays(w.days)}
              className={`px-2 py-1 rounded-sm tabular ${
                days === w.days
                  ? "text-ink border border-rule"
                  : "text-quiet hover:text-ink"
              }`}
            >
              {t(w.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className={loading ? "opacity-60 transition-opacity" : ""}>
        {data.events.length === 0 ? (
          <div className="text-sm text-whisper italic py-6">
            {t("foresight.empty", { n: data.days })}
            {data.days === 7 && ` ${t("foresight.try_30d")}`}
          </div>
        ) : (
          <div>
            {data.events.map((e) => (
              <EventRow
                key={e.event_id}
                event={e}
                days={days}
                expanded={!!expanded[e.event_id]}
                onToggle={() => toggle(e.event_id)}
                insight={insightById[e.event_id]}
              />
            ))}
          </div>
        )}
      </div>

      {data.holdings_covered.length > 0 && (
        <div className="text-xs text-whisper mt-3 tabular">
          {t("foresight.covering", { names: data.holdings_covered.join(" · ") })}
        </div>
      )}
    </section>
  );
}

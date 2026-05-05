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

interface Props {
  initial: ForesightResponse;
}

const WINDOWS: { label: string; days: number }[] = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
];

const KIND_LABEL: Record<ForesightKind, string> = {
  earnings: "earnings",
  macro: "macro",
  company_event: "event",
};

type InsightState =
  | { kind: "loading" }
  | { kind: "ready"; data: ForesightInsightResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function daysUntilLabel(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d}d`;
}

interface RowProps {
  event: ForesightEvent;
  days: number;
  expanded: boolean;
  onToggle: () => void;
  insight: InsightState | undefined;
}

function EventRow({ event, days, expanded, onToggle, insight }: RowProps) {
  return (
    <div className="py-3 border-b border-rule/60 last:border-b-0">
      <div className="grid grid-cols-[7rem_5rem_1fr_auto] gap-x-4 items-baseline">
        <div className="tabular text-sm">
          <div className="text-ink">{formatDate(event.date)}</div>
          <div className="text-xs text-whisper">{daysUntilLabel(event.days_until)}</div>
        </div>
        <div className="text-xs uppercase tracking-[0.06em] text-quiet">
          <div>{KIND_LABEL[event.kind]}</div>
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
          {expanded ? "[hide]" : "[learn more]"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 ml-[7rem] pl-4 border-l border-rule/60">
          {(!insight || insight.kind === "loading") && (
            <div role="status" aria-label="Drafting commentary…" className="flex flex-col gap-2 max-w-[60ch]">
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
            <p className="text-sm text-loss">commentary unavailable: {insight.detail}</p>
          )}
          {insight?.kind === "ready" && (
            <dl className="flex flex-col gap-2 text-sm leading-[1.6] max-w-[60ch]">
              {insight.data.what && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">What</dt>
                  <dd className="text-ink">{insight.data.what}</dd>
                </div>
              )}
              {insight.data.meaning && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">Meaning</dt>
                  <dd className="text-ink">{insight.data.meaning}</dd>
                </div>
              )}
              {insight.data.watch && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">Watch</dt>
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
          Next <span className="text-ink">{data.days} days</span>
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
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className={loading ? "opacity-60 transition-opacity" : ""}>
        {data.events.length === 0 ? (
          <div className="text-sm text-whisper italic py-6">
            No scheduled events in the next {data.days} days.
            {data.days === 7 && " Try the 30D view for a wider lookahead."}
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
          Covering {data.holdings_covered.join(" · ")}
        </div>
      )}
    </section>
  );
}

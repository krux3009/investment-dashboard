"use client";

// "Tomorrow's preview" — small block at the page footer showing US
// futures + Asia closes, the temperature read on how the next US open
// might shape up. Block always renders; outside SGT pre-market window
// (17:00–22:00) it dims and shows when the data was last refreshed.
//
// Each row has a [learn more] toggle that lazy-fetches a Claude-
// generated What/Meaning/Watch block via /api/preview-insight/{symbol}.
// State is per-symbol so multiple rows can be open at once.

import { useEffect, useState } from "react";
import {
  fetchPreview,
  fetchPreviewInsight,
  type PreviewResponse,
  type PreviewRow,
  type PreviewInsightResponse,
} from "@/lib/api";
import { directionClass } from "@/lib/format";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: PreviewResponse }
  | { kind: "error"; detail: string };

type RowInsightState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: PreviewInsightResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

function fmtSignedPct(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  return `${sign}${(abs * 100).toFixed(decimals)}%`;
}

function arrowFor(value: number): "↑" | "↓" | "–" {
  if (value === 0) return "–";
  return value > 0 ? "↑" : "↓";
}

function fmtTimeSinceHours(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day ago`;
}

export function PreviewBlock() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [insightBySym, setInsightBySym] = useState<Record<string, RowInsightState>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPreview();
        if (!cancelled) setState({ kind: "ready", data });
      } catch (e) {
        if (!cancelled) setState({ kind: "error", detail: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(symbol: string) {
    const isOpening = !expanded[symbol];
    setExpanded((prev) => ({ ...prev, [symbol]: !prev[symbol] }));
    if (!isOpening) return;
    if (insightBySym[symbol]?.kind === "ready") return;
    setInsightBySym((prev) => ({ ...prev, [symbol]: { kind: "loading" } }));
    const result = await fetchPreviewInsight(symbol, false);
    setInsightBySym((prev) => ({
      ...prev,
      [symbol]: result.ok
        ? { kind: "ready", data: result.data }
        : result.status === 503
          ? { kind: "unavailable", detail: result.detail }
          : { kind: "error", detail: result.detail },
    }));
  }

  if (state.kind === "loading") {
    return (
      <section className="mt-12 pt-8 border-t border-rule">
        <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
          Tomorrow&apos;s preview
        </div>
        <div className="text-sm text-quiet italic">loading market read…</div>
      </section>
    );
  }
  if (state.kind === "error") {
    // Preview is nice-to-have; when yfinance hiccups we hide rather than scream.
    return null;
  }

  const { rows, in_window, fetched_at } = state.data;
  if (rows.length === 0) return null;

  return (
    <section
      className={`mt-12 pt-8 border-t border-rule ${in_window ? "" : "opacity-60"}`}
    >
      <div className="flex items-baseline justify-between gap-4 mb-1.5">
        <div className="text-xs uppercase tracking-[0.06em] text-quiet">
          Tomorrow&apos;s preview
        </div>
        <div className="text-xs text-whisper">
          {in_window
            ? `updated ${fmtTimeSinceHours(fetched_at)}`
            : `last update ${fmtTimeSinceHours(fetched_at)} · US market open`}
        </div>
      </div>
      <p className="text-sm text-whisper italic mb-5 max-w-[60ch]">
        Overnight futures and Asia closes give a hint at how the US market
        may open. Most useful in the hours before the New York open
        (around 9:30 PM Singapore time).
      </p>

      <ul className="flex flex-col gap-4 max-w-[68ch]">
        {rows.map((r) => {
          const isOpen = !!expanded[r.symbol];
          const insight = insightBySym[r.symbol];
          return (
            <li key={r.symbol}>
              <PreviewRowEntry
                row={r}
                isOpen={isOpen}
                onToggle={() => void toggle(r.symbol)}
              />
              {isOpen && (
                <div className="mt-3 pl-4 border-l border-rule/60">
                  {insight?.kind === "loading" && (
                    <div className="text-sm text-quiet italic">
                      drafting explanation…
                    </div>
                  )}
                  {insight?.kind === "unavailable" && (
                    <div className="text-sm text-whisper italic">
                      {insight.detail}
                    </div>
                  )}
                  {insight?.kind === "error" && (
                    <div className="text-sm text-loss">
                      explanation unavailable: {insight.detail}
                    </div>
                  )}
                  {insight?.kind === "ready" && (
                    <dl className="flex flex-col gap-2.5 text-sm leading-[1.65]">
                      {insight.data.what && (
                        <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                          <dt className="text-xs uppercase tracking-wide text-quiet">
                            What
                          </dt>
                          <dd className="text-ink">{insight.data.what}</dd>
                        </div>
                      )}
                      {insight.data.meaning && (
                        <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                          <dt className="text-xs uppercase tracking-wide text-quiet">
                            Meaning
                          </dt>
                          <dd className="text-ink">{insight.data.meaning}</dd>
                        </div>
                      )}
                      {insight.data.watch && (
                        <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                          <dt className="text-xs uppercase tracking-wide text-quiet">
                            Watch
                          </dt>
                          <dd className="text-ink">{insight.data.watch}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface RowProps {
  row: PreviewRow;
  isOpen: boolean;
  onToggle: () => void;
}

function PreviewRowEntry({ row, isOpen, onToggle }: RowProps) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-6">
        <div className="text-[15px] text-ink">{row.label}</div>
        <div
          className={`tabular ${directionClass(row.change_pct)} flex items-baseline gap-1.5`}
        >
          <span aria-hidden>{arrowFor(row.change_pct)}</span>
          <span>{fmtSignedPct(row.change_pct)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="text-xs text-quiet underline-offset-4 hover:underline mt-1"
      >
        {isOpen ? "hide details" : "learn more"}
      </button>
    </div>
  );
}

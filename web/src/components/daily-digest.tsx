"use client";

// Phase C.1 — AI daily digest. Collapsed by default. First expand triggers
// a lazy fetch of /api/digest; the backend caches for 6h so subsequent
// loads stay free. 503 from the API (missing ANTHROPIC_API_KEY) renders
// a quiet hint instead of an error.

import { useState } from "react";
import { fetchDigest, type DigestResponse } from "@/lib/api";
import { timeSince } from "@/lib/format";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: DigestResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

// The v4-summary prompt asks Claude for a short top-of-page digest:
//
//   LEAD: <one sentence portfolio-level read>
//
//   <TICKER>: <one short sentence>
//   <TICKER>: <one short sentence>
//
// Deeper Meaning + Watch lines live in each holding's drill-in via
// /api/insight/{code}. The parser also tolerates older v3-edu prose
// (Today/Meaning/Watch blocks) — it pulls just the Today line so a
// stale cache still renders as a summary.
interface ParsedRow {
  ticker: string;
  text: string;
}

interface ParsedDigest {
  lead: string;
  rows: ParsedRow[];
}

function parseDigest(prose: string): ParsedDigest {
  const lines = prose
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let lead = "";
  const rows: ParsedRow[] = [];

  // For v3-edu fallback parsing.
  let pendingTicker: string | null = null;
  const tickerHeaderRe = /^([A-Z0-9.]{1,12})$/;
  const sectionRe = /^(today|meaning|watch)\s*:\s*(.+)$/i;
  const tickerColonRe = /^([A-Z0-9.]{1,12})\s*:\s*(.+)$/;

  for (const line of lines) {
    const leadMatch = /^LEAD\s*:\s*(.+)$/i.exec(line);
    if (leadMatch) {
      lead = leadMatch[1].trim();
      pendingTicker = null;
      continue;
    }

    // v4-summary current shape: "<TICKER>: <one sentence>"
    const colonMatch = tickerColonRe.exec(line);
    if (colonMatch) {
      rows.push({ ticker: colonMatch[1], text: colonMatch[2].trim() });
      pendingTicker = null;
      continue;
    }

    // v3-edu fallback: bare ticker line opens a block; only the
    // following Today: line counts toward the summary.
    const headerMatch = tickerHeaderRe.exec(line);
    if (headerMatch) {
      pendingTicker = headerMatch[1];
      continue;
    }
    const sectionMatch = sectionRe.exec(line);
    if (sectionMatch && pendingTicker) {
      const label = sectionMatch[1].toLowerCase();
      if (label === "today") {
        rows.push({ ticker: pendingTicker, text: sectionMatch[2].trim() });
      }
      // meaning/watch from old prose are intentionally dropped — those
      // belong in the per-stock drill-in now.
      if (label === "today") pendingTicker = null;
      continue;
    }
  }

  if (!lead && rows.length === 0) {
    return { lead: prose.trim(), rows: [] };
  }
  return { lead, rows };
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function DailyDigest() {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function load(refresh = false) {
    setState({ kind: "loading" });
    const result = await fetchDigest(refresh);
    if (result.ok) {
      setState({ kind: "ready", data: result.data });
    } else if (result.status === 503) {
      setState({ kind: "unavailable", detail: result.detail });
    } else {
      setState({ kind: "error", detail: result.detail });
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && state.kind === "idle") {
      void load(false);
    }
  }

  const subtitle =
    state.kind === "ready"
      ? `Generated ${timeSince(state.data.generated_at)}${state.data.cached ? " · cached" : ""}`
      : state.kind === "loading"
        ? "Loading…"
        : state.kind === "unavailable"
          ? "Set ANTHROPIC_API_KEY in .env to enable"
          : state.kind === "error"
            ? "Could not load"
            : "Click to read today's digest";

  return (
    <section className="border-b border-rule pb-10 mb-10">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-baseline justify-between gap-4 text-left"
      >
        <div>
          <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-1.5">
            Daily digest
          </div>
          <div className="text-sm text-whisper italic">{subtitle}</div>
        </div>
        <span
          aria-hidden
          className={`text-quiet text-sm transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>

      {expanded && (
        <div className="mt-6">
          {state.kind === "loading" && (
            <div className="text-sm text-quiet italic">drafting digest…</div>
          )}

          {state.kind === "ready" && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-6 pb-4 border-b border-rule/60">
                <div className="text-sm text-ink">
                  {formatGeneratedAt(state.data.generated_at)}
                </div>
                <div className="flex items-center gap-3 text-xs text-quiet">
                  <span className="tracking-wide">
                    {state.data.holdings_covered.join(" · ")}
                  </span>
                  <span aria-hidden className="text-rule">|</span>
                  <span>
                    {state.data.cached
                      ? `cached ${timeSince(state.data.generated_at)}`
                      : `fresh ${timeSince(state.data.generated_at)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void load(true)}
                    className="underline-offset-4 hover:underline"
                  >
                    refresh
                  </button>
                </div>
              </div>

              {(() => {
                const parsed = parseDigest(state.data.prose);
                return (
                  <div className="max-w-[68ch]">
                    {parsed.lead && (
                      <p className="text-[17px] text-ink leading-[1.55] mb-7">
                        {parsed.lead}
                      </p>
                    )}
                    {parsed.rows.length > 0 && (
                      <dl className="flex flex-col gap-4">
                        {parsed.rows.map((r) => (
                          <div
                            key={r.ticker}
                            className="grid grid-cols-[5rem_1fr] gap-x-5 items-baseline"
                          >
                            <dt className="font-mono text-xs uppercase tracking-[0.08em] text-quiet">
                              {r.ticker}
                            </dt>
                            <dd className="text-[14px] text-ink leading-[1.7]">
                              {r.text}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <p className="mt-7 text-xs text-whisper italic">
                      Expand a holding for a deeper read of what its
                      numbers mean and what to watch.
                    </p>
                  </div>
                );
              })()}
            </>
          )}

          {state.kind === "unavailable" && (
            <p className="text-sm text-whisper italic">{state.detail}</p>
          )}

          {state.kind === "error" && (
            <p className="text-sm text-loss">
              digest unavailable: {state.detail}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

"use client";

// AI daily digest. Always-on at the top of the home page since the
// route split made the surface uncluttered enough to render
// expanded by default. /api/digest is server-cached for 6h.
// 503 from the API (missing ANTHROPIC_API_KEY) renders a quiet hint.

import { useEffect, useState } from "react";
import { fetchDigest, type DigestResponse } from "@/lib/api";
import { timeSince } from "@/lib/format";

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: DigestResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

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

    const colonMatch = tickerColonRe.exec(line);
    if (colonMatch) {
      rows.push({ ticker: colonMatch[1], text: colonMatch[2].trim() });
      pendingTicker = null;
      continue;
    }

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
        pendingTicker = null;
      }
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
  const [state, setState] = useState<State>({ kind: "loading" });

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

  useEffect(() => {
    void load(false);
  }, []);

  return (
    <section className="border-b border-rule pb-10 mb-10">
      <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-4">
        Daily digest
      </div>

      {state.kind === "loading" && (
        <div
          role="status"
          aria-label="Drafting digest…"
          className="space-y-3 max-w-[68ch]"
        >
          <div className="h-4 w-3/4 rounded bg-rule/40 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-rule/40 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-rule/40 animate-pulse" />
        </div>
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
                  Expand a holding on the portfolio page for a deeper read
                  of what its numbers mean and what to watch.
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
    </section>
  );
}

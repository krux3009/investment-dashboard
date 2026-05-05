"use client";

// Per-stock educational insight block. Lives inside the holdings
// drill-in alongside the price chart and anomaly content. Lazy-fetched
// when the row is expanded; cached server-side for 6h. The daily digest
// up top stays as short summaries; deeper teaching about ONE ticker
// happens here.

import { useEffect, useState } from "react";
import { fetchInsight, type InsightResponse } from "@/lib/api";

interface Props {
  code: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: InsightResponse }
  | { kind: "absent" }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

function Header() {
  return (
    <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
      What this means
    </div>
  );
}

export function InsightBlock({ code }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      const result = await fetchInsight(code, false);
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
  }, [code]);

  // Watchlist rows that aren't held positions: render nothing rather than
  // a red error. The drill-in still shows the price chart + technicals.
  if (state.kind === "absent") return null;

  if (state.kind === "loading") {
    return (
      <div>
        <Header />
        <dl
          role="status"
          aria-label="Drafting insight…"
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
        <Header />
        <div className="text-sm text-whisper italic">{state.detail}</div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div>
        <Header />
        <div className="text-sm text-loss">
          insight unavailable: {state.detail}
        </div>
      </div>
    );
  }

  const { meaning, watch } = state.data;
  if (!meaning && !watch) return null;
  return (
    <div>
      <Header />
      <dl className="flex flex-col gap-3 text-sm leading-[1.65]">
        {meaning && (
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
            <dt className="text-xs uppercase tracking-wide text-quiet">
              Meaning
            </dt>
            <dd className="text-ink">{meaning}</dd>
          </div>
        )}
        {watch && (
          <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
            <dt className="text-xs uppercase tracking-wide text-quiet">
              Watch
            </dt>
            <dd className="text-ink">{watch}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

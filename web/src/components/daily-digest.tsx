"use client";

// Per-ticker four-tile digest grid. Each holding owns one row; that row
// renders four observation-only sentences across Fundamentals, News,
// Sentiment, Technical. /api/digest is server-cached for 6h. 503 from
// missing ANTHROPIC_API_KEY renders a quiet hint.

import { useEffect, useState } from "react";
import { fetchDigest, type DigestResponse, type TickerTiles } from "@/lib/api";
import { timeSince } from "@/lib/format";

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: DigestResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

type SentenceKey = "fundamentals" | "news" | "sentiment" | "technical";
type QuietKey = "fundamentals_quiet" | "news_quiet" | "sentiment_quiet" | "technical_quiet";

const TILE_LABELS: Array<{
  key: SentenceKey;
  quietKey: QuietKey;
  label: string;
  initial: string;
}> = [
  { key: "fundamentals", quietKey: "fundamentals_quiet", label: "Fundamentals", initial: "F" },
  { key: "news", quietKey: "news_quiet", label: "News", initial: "N" },
  { key: "sentiment", quietKey: "sentiment_quiet", label: "Sentiment", initial: "S" },
  { key: "technical", quietKey: "technical_quiet", label: "Technical", initial: "T" },
];

// When ≥ this many of the 4 tiles are quiet, the row collapses into a
// single italic line `quiet across F/S/T` next to whichever tile still
// has signal. Reduces visual noise on slow days without hiding signal.
const QUIET_COLLAPSE_THRESHOLD = 3;

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function TileSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-3 w-20 rounded bg-rule/40 animate-pulse" />
      <div className="h-4 w-full rounded bg-rule/40 animate-pulse" />
      <div className="h-4 w-5/6 rounded bg-rule/40 animate-pulse" />
    </div>
  );
}

function Tile({
  label,
  sentence,
  isQuiet,
}: {
  label: string;
  sentence: string;
  isQuiet: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-quiet">
        {label}
      </div>
      <p
        className={`text-[13px] leading-[1.55] ${
          isQuiet ? "text-whisper italic" : "text-ink"
        }`}
      >
        {sentence}
      </p>
    </div>
  );
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
      <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-1">
        Daily digest
      </div>
      <div className="text-xs text-whisper mb-6">
        Four dimensions per holding · observation only
      </div>

      {state.kind === "loading" && (
        <div role="status" aria-label="Drafting digest…" className="space-y-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="grid grid-cols-1 md:grid-cols-[6rem_1fr_1fr_1fr_1fr] gap-4 md:gap-6"
            >
              <div className="h-5 w-20 rounded bg-rule/40 animate-pulse" />
              <TileSkeleton />
              <TileSkeleton />
              <TileSkeleton />
              <TileSkeleton />
            </div>
          ))}
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
                {state.data.holdings.map((h) => h.ticker).join(" · ")}
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

          {state.data.holdings.length === 0 && (
            <p className="text-sm text-whisper italic">
              No open positions today.
            </p>
          )}

          {state.data.holdings.length > 0 && (
            <div className="flex flex-col gap-8">
              {state.data.holdings.map((h) => {
                const quietCount = TILE_LABELS.reduce(
                  (n, t) => n + (h[t.quietKey] ? 1 : 0),
                  0,
                );
                const collapsed = quietCount >= QUIET_COLLAPSE_THRESHOLD;

                if (collapsed) {
                  const quietInitials = TILE_LABELS.filter((t) => h[t.quietKey])
                    .map((t) => t.initial)
                    .join("/");
                  const activeTiles = TILE_LABELS.filter((t) => !h[t.quietKey]);
                  return (
                    <div
                      key={h.code}
                      className="grid grid-cols-1 md:grid-cols-[6rem_1fr] gap-4 md:gap-6 md:items-start"
                    >
                      <div className="md:pt-0.5">
                        <div className="font-mono text-sm uppercase tracking-[0.06em] text-ink">
                          {h.ticker}
                        </div>
                        <div className="text-[11px] text-whisper mt-0.5 truncate">
                          {h.name}
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-8">
                        <span className="text-[13px] leading-[1.55] text-whisper italic md:pt-0">
                          quiet across {quietInitials}
                        </span>
                        {activeTiles.map((t) => (
                          <div key={t.key} className="md:max-w-md">
                            <Tile
                              label={t.label}
                              sentence={h[t.key]}
                              isQuiet={false}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={h.code}
                    className="grid grid-cols-1 md:grid-cols-[6rem_1fr_1fr_1fr_1fr] gap-4 md:gap-6 md:items-start"
                  >
                    <div className="md:pt-0.5">
                      <div className="font-mono text-sm uppercase tracking-[0.06em] text-ink">
                        {h.ticker}
                      </div>
                      <div className="text-[11px] text-whisper mt-0.5 truncate">
                        {h.name}
                      </div>
                    </div>
                    {TILE_LABELS.map((t) => (
                      <Tile
                        key={t.key}
                        label={t.label}
                        sentence={h[t.key]}
                        isQuiet={h[t.quietKey]}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-8 text-xs text-whisper italic">
            Expand a holding on the portfolio page for a deeper read of what
            its numbers mean and what to watch.
          </p>
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

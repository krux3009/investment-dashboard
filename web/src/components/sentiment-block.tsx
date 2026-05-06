"use client";

// Reddit-discussion drill-in panel. Lives between NotesBlock and
// AnomalyBlock inside the holdings + watchlist drill-in. Renders post
// counts, a single-ink-family stacked bar, three representative posts,
// and a lazy [learn more] What/Meaning/Watch trio.
//
// Educational framing only — observation, not a buy/sell signal. No
// green / red, single ink family for the bar; principle-#2 calm-under-
// volatility holds.

import { useEffect, useState } from "react";
import {
  fetchReddit,
  fetchSentimentInsight,
  type RedditMention,
  type RedditResponse,
  type SentimentBucket,
  type SentimentInsightResponse,
} from "@/lib/api";

interface Props {
  code: string;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; data: RedditResponse }
  | { kind: "error"; detail: string };

type InsightState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: SentimentInsightResponse }
  | { kind: "absent" }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

const BUCKET_LABEL: Record<SentimentBucket, string> = {
  positive: "favourable",
  neutral: "neutral",
  negative: "cautious",
};

// Single ink family — lightest → heaviest as the eye moves from
// favourable to cautious. No green / red, no valence color.
const BUCKET_BG: Record<SentimentBucket, string> = {
  positive: "bg-whisper",
  neutral: "bg-quiet",
  negative: "bg-ink",
};

function Header() {
  return (
    <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
      Reddit discussion · past 7 days
    </div>
  );
}

function StackedBar({
  buckets,
  total,
}: {
  buckets: Record<SentimentBucket, number>;
  total: number;
}) {
  if (total === 0) return null;
  const order: SentimentBucket[] = ["positive", "neutral", "negative"];
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-rule/40">
      {order.map((b) => {
        const w = (buckets[b] / total) * 100;
        if (w === 0) return null;
        return (
          <div
            key={b}
            className={BUCKET_BG[b]}
            style={{ width: `${w}%` }}
            aria-label={`${buckets[b]} ${BUCKET_LABEL[b]} posts`}
          />
        );
      })}
    </div>
  );
}

function MentionRow({ m }: { m: RedditMention }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left text-ink hover:text-accent transition-colors"
        aria-expanded={open}
      >
        <span className="text-whisper tabular">r/{m.subreddit}</span>
        <span className="text-quiet mx-1.5">·</span>
        <span className="text-quiet tabular">{m.score}↑</span>
        <span className="text-quiet mx-1.5">·</span>
        <span>{m.title}</span>
      </button>
      {open && (
        <a
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 ml-4 block text-xs text-quiet hover:text-accent underline decoration-rule underline-offset-2"
        >
          open on reddit ↗
        </a>
      )}
    </li>
  );
}

function LearnMore({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<InsightState>({ kind: "idle" });

  useEffect(() => {
    if (!expanded) return;
    if (state.kind !== "idle" && state.kind !== "error") return;
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      const result = await fetchSentimentInsight(code, false);
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
    // Effect deps deliberately exclude state — re-running on every
    // setState would loop. See feedback_lazy_fetch_deps.md.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, code]);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs uppercase tracking-[0.04em] text-quiet hover:text-accent transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? "[hide]" : "[learn more]"}
      </button>
      {expanded && (
        <div className="mt-3">
          {state.kind === "loading" && (
            <div className="text-sm text-quiet italic">drafting insight…</div>
          )}
          {state.kind === "absent" && (
            <div className="text-sm text-whisper italic">
              not enough discussion to interpret yet.
            </div>
          )}
          {state.kind === "unavailable" && (
            <div className="text-sm text-whisper italic">{state.detail}</div>
          )}
          {state.kind === "error" && (
            <div className="text-sm text-loss">
              insight unavailable: {state.detail}
            </div>
          )}
          {state.kind === "ready" && (
            <dl className="flex flex-col gap-3 text-sm leading-[1.65]">
              {state.data.what && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">What</dt>
                  <dd className="text-ink">{state.data.what}</dd>
                </div>
              )}
              {state.data.meaning && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">Meaning</dt>
                  <dd className="text-ink">{state.data.meaning}</dd>
                </div>
              )}
              {state.data.watch && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">Watch</dt>
                  <dd className="text-ink">{state.data.watch}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

export function SentimentBlock({ code }: Props) {
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      const result = await fetchReddit(code, 7);
      if (cancelled) return;
      if (result.ok) {
        setState({ kind: "ready", data: result.data });
      } else {
        setState({ kind: "error", detail: result.detail });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state.kind === "loading") {
    return (
      <div>
        <Header />
        <div className="text-sm text-quiet italic">loading discussion…</div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div>
        <Header />
        <div className="text-sm text-loss">
          could not load discussion: {state.detail}
        </div>
      </div>
    );
  }

  const { data } = state;
  if (data.total_mentions === 0) {
    return (
      <div>
        <Header />
        <div className="text-sm text-whisper italic">
          no discussion in the past 7 days.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="text-sm text-ink tabular mb-2.5">
        <span>{data.buckets.positive}</span>
        <span className="text-whisper"> favourable · </span>
        <span>{data.buckets.neutral}</span>
        <span className="text-whisper"> neutral · </span>
        <span>{data.buckets.negative}</span>
        <span className="text-whisper"> cautious</span>
      </div>
      <StackedBar buckets={data.buckets} total={data.total_mentions} />
      {data.top_mentions.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {data.top_mentions.map((m) => (
            <MentionRow key={m.post_id} m={m} />
          ))}
        </ul>
      )}
      <LearnMore code={code} />
    </div>
  );
}

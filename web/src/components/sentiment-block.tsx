"use client";

// Reddit-discussion drill-in panel. Lives between NotesBlock and
// AnomalyBlock inside the holdings + watchlist drill-in. Renders post
// counts, a single-ink-family stacked bar, and three representative
// posts.
//
// No green / red, single ink family for the bar; principle-#2
// calm-under-volatility holds.

import { useState } from "react";
import {
  fetchReddit,
  type RedditMention,
  type SentimentBucket,
} from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { StackedBar } from "./stacked-bar";
import { useT } from "@/lib/i18n/use-t";
import type { StringKey } from "@/lib/i18n/strings";

interface Props {
  code: string;
}

const BUCKET_LABEL_KEY: Record<SentimentBucket, StringKey> = {
  positive: "sentiment.bucket.favourable",
  neutral: "sentiment.bucket.neutral",
  negative: "sentiment.bucket.cautious",
};

// Single ink family — lightest → heaviest as the eye moves from
// favourable to cautious. No green / red, no valence color.
const BUCKET_BG: Record<SentimentBucket, string> = {
  positive: "bg-whisper",
  neutral: "bg-quiet",
  negative: "bg-ink",
};

function Header({ label }: { label: string }) {
  return (
    <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-3">
      {label}
    </div>
  );
}

function SentimentBar({
  buckets,
  total,
}: {
  buckets: Record<SentimentBucket, number>;
  total: number;
}) {
  const t = useT();
  if (total === 0) return null;
  const order: SentimentBucket[] = ["positive", "neutral", "negative"];
  return (
    <StackedBar
      segments={order.map((b) => ({
        key: b,
        pct: (buckets[b] / total) * 100,
        className: BUCKET_BG[b],
        ariaLabel: t("sentiment.aria.posts", {
          n: buckets[b],
          bucket: t(BUCKET_LABEL_KEY[b]),
        }),
      }))}
    />
  );
}

function MentionRow({ m }: { m: RedditMention }) {
  const t = useT();
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
          {t("sentiment.open_reddit")}
        </a>
      )}
    </li>
  );
}

export function SentimentBlock({ code }: Props) {
  const t = useT();
  const { state } = useFetch(async () => {
    const result = await fetchReddit(code, 7);
    if (!result.ok) throw new Error(result.detail);
    return result.data;
  }, [code]);
  const headerLabel = t("sentiment.heading");

  if (state.kind === "loading") {
    return (
      <div>
        <Header label={headerLabel} />
        <div className="text-sm text-quiet italic">{t("sentiment.loading_discussion")}</div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div>
        <Header label={headerLabel} />
        <div className="text-sm text-loss">
          {t("sentiment.discussion_load_failed", { detail: state.detail })}
        </div>
      </div>
    );
  }

  const { data } = state;
  if (data.total_mentions === 0) {
    return (
      <div>
        <Header label={headerLabel} />
        <div className="text-sm text-whisper italic">
          {t("sentiment.no_discussion")}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header label={headerLabel} />
      <div className="text-sm text-ink tabular mb-2.5">
        <span>{data.buckets.positive}</span>
        <span className="text-whisper"> {t("sentiment.bucket.favourable")} · </span>
        <span>{data.buckets.neutral}</span>
        <span className="text-whisper"> {t("sentiment.bucket.neutral")} · </span>
        <span>{data.buckets.negative}</span>
        <span className="text-whisper"> {t("sentiment.bucket.cautious")}</span>
      </div>
      <SentimentBar buckets={data.buckets} total={data.total_mentions} />
      {data.top_mentions.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {data.top_mentions.map((m) => (
            <MentionRow key={m.post_id} m={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

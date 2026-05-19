/**
 * SnowflakeCard — wraps the Snowflake graphic with a heading, plain-English
 * summary, and risk/reward count badges. Used as the top-right card on
 * /portfolio Holdings tab (mirrors SWS Portfolio Snowflake card).
 *
 * Scores + counts are stubbed until P5 wires `/api/snowflake/portfolio`.
 */

import { Snowflake, type SnowflakeScores } from "@/components/snowflake";

interface Props {
  heading: string;
  scores: SnowflakeScores;
  summary?: string;
  holdingsCount?: number | null;
  risks?: number | null;
  rewards?: number | null;
  holdingsCountLabel?: string;
  risksLabel?: string;
  rewardsLabel?: string;
}

export function SnowflakeCard({
  heading,
  scores,
  summary,
  holdingsCount,
  risks,
  rewards,
  holdingsCountLabel,
  risksLabel,
  rewardsLabel,
}: Props) {
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-5 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">{heading}</h2>
      </header>

      <div className="flex flex-col items-center gap-3">
        <Snowflake size={240} scores={scores} variant="portfolio" />
        {summary ? (
          <p className="text-sm text-quiet text-center leading-snug max-w-[26ch]">{summary}</p>
        ) : null}
      </div>

      <footer className="flex items-center justify-center gap-4 text-xs">
        {holdingsCount != null ? (
          <span className="text-quiet tabular">
            {holdingsCountLabel ?? `${holdingsCount} holdings`}
          </span>
        ) : null}
        {risks != null ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[color-mix(in_oklch,var(--accent-danger)_18%,transparent)] text-[var(--accent-danger)] tabular">
            <span aria-hidden>●</span>
            {risks}
            <span className="sr-only">{risksLabel}</span>
          </span>
        ) : null}
        {rewards != null ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[color-mix(in_oklch,var(--accent-success)_18%,transparent)] text-[var(--accent-success)] tabular">
            <span aria-hidden>★</span>
            {rewards}
            <span className="sr-only">{rewardsLabel}</span>
          </span>
        ) : null}
      </footer>
    </section>
  );
}

"use client";

/**
 * SnowflakeCard — wraps the Snowflake graphic with a heading, plain-English
 * summary, and risk/reward count badges. Used as the top-right card on
 * /portfolio Holdings tab (mirrors SWS Portfolio Snowflake card).
 *
 * Client component: the fixed chrome (heading, holdings-count, risk/reward
 * labels) self-translates via useT from the existing portfolio.* keys. Each
 * label still accepts a prop override for callers that need custom text.
 *
 * Scores + counts are stubbed until P5 wires `/api/snowflake/portfolio`.
 */

import { Snowflake, type SnowflakeScores } from "@/components/snowflake";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  heading?: string;
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
  const t = useT();
  const resolvedHeading = heading ?? t("portfolio.snowflake.heading");
  const resolvedRisksLabel = risksLabel ?? t("portfolio.snowflake.risks_label");
  const resolvedRewardsLabel = rewardsLabel ?? t("portfolio.snowflake.rewards_label");
  const resolvedHoldingsCountLabel =
    holdingsCountLabel ??
    (holdingsCount != null
      ? t("portfolio.perf.holdings_count", { n: holdingsCount })
      : undefined);

  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-5 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">{resolvedHeading}</h2>
      </header>

      <div className="flex flex-col items-center gap-3">
        <Snowflake size={240} scores={scores} variant="portfolio" />
        {summary ? (
          <p className="text-sm text-quiet text-center leading-snug max-w-[26ch]">{summary}</p>
        ) : null}
      </div>

      <footer className="flex items-center justify-center gap-4 text-xs">
        {holdingsCount != null ? (
          <span className="text-quiet tabular">{resolvedHoldingsCountLabel}</span>
        ) : null}
        {risks != null ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[color-mix(in_oklch,var(--accent-danger)_18%,transparent)] text-[var(--accent-danger)] tabular">
            <span aria-hidden>●</span>
            {risks}
            <span className="sr-only">{resolvedRisksLabel}</span>
          </span>
        ) : null}
        {rewards != null ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[color-mix(in_oklch,var(--accent-success)_18%,transparent)] text-[var(--accent-success)] tabular">
            <span aria-hidden>★</span>
            {rewards}
            <span className="sr-only">{resolvedRewardsLabel}</span>
          </span>
        ) : null}
      </footer>
    </section>
  );
}

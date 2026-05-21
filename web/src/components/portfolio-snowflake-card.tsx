"use client";

/**
 * PortfolioSnowflakeCard — client wrapper around SnowflakeCard for the
 * /portfolio Holdings tab. page.tsx is a SERVER component and can't call
 * useT, so it passes the scores + holdings count + an `available` flag;
 * this picks the translated summary line and lets SnowflakeCard's chrome
 * self-translate.
 */

import { SnowflakeCard } from "@/components/snowflake-card";
import type { SnowflakeScores } from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  scores: SnowflakeScores;
  holdingsCount: number;
  available: boolean; // false → backend unreachable
}

export function PortfolioSnowflakeCard({ scores, holdingsCount, available }: Props) {
  const t = useT();
  return (
    <SnowflakeCard
      scores={scores}
      summary={
        available
          ? t("portfolio.snowflake.summary_live")
          : t("portfolio.snowflake.summary_unreachable")
      }
      holdingsCount={holdingsCount}
    />
  );
}

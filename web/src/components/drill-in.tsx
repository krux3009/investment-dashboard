"use client";

import { fetchAnomalies, fetchPrices } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { AnomalyBlock } from "./anomaly-block";
import { NotesBlock } from "./notes-block";
import { PriceChart } from "./price-chart";
import { SentimentBlock } from "./sentiment-block";
import { SnowflakeStatements } from "./snowflake-statements";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";

interface Props {
  code: string;
  // Direction tints the price line. Use total return for holdings; for
  // watchlist rows pass the 30d delta direction.
  direction: "gain" | "loss" | "quiet";
}

// Lazy-loaded drill-in content — fetched on first expand, cached per
// code via component state. Symmetric for holdings + watchlist rows.
export function DrillIn({ code, direction }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const prices = useFetch(() => fetchPrices(code, 90), [code]);
  const anomalies = useFetch(() => fetchAnomalies(code, locale), [code, locale]);

  return (
    <div className="px-6 py-6 bg-surface-expanded border-t border-rule">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div>
          <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-2">
            {t("drillin.heading")}
          </div>
          {prices.error ? (
            <div className="text-sm text-loss">
              {t("drillin.price_load_failed", { detail: prices.error })}
            </div>
          ) : prices.data === null ? (
            <div className="text-sm text-quiet italic h-[220px] flex items-center">
              {t("drillin.loading_chart")}
            </div>
          ) : (
            <PriceChart points={prices.data.points} direction={direction} />
          )}
        </div>

        <div className="flex flex-col gap-7">
          <NotesBlock code={code} />
          <SentimentBlock code={code} />
          <div>
            <AnomalyBlock
              items={anomalies.data?.items ?? []}
              timeRange={anomalies.data?.time_range ?? 30}
              loading={anomalies.loading}
              error={anomalies.error}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 pt-8 border-t border-rule">
        <SnowflakeStatements code={code} />
      </div>
    </div>
  );
}

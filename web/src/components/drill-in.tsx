"use client";

import { fetchAnomalies, fetchPrices } from "@/lib/api";
import type { AnomalyItem, PricePoint } from "@/lib/api";
import { useEffect, useState } from "react";
import { AnomalyBlock } from "./anomaly-block";
import { InsightBlock } from "./insight-block";
import { NotesBlock } from "./notes-block";
import { PriceChart } from "./price-chart";

interface Props {
  code: string;
  // Direction tints the price line. Use total return for holdings; for
  // watchlist rows pass the 30d delta direction.
  direction: "gain" | "loss" | "quiet";
}

// Lazy-loaded drill-in content — fetched on first expand, cached per
// code via component state. Symmetric for holdings + watchlist rows.
export function DrillIn({ code, direction }: Props) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [anomalyItems, setAnomalyItems] = useState<AnomalyItem[]>([]);
  const [anomaliesLoading, setAnomaliesLoading] = useState(true);
  const [anomaliesError, setAnomaliesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPrices(code, 90);
        if (!cancelled) setPoints(data.points);
      } catch (e) {
        if (!cancelled) setPricesError(String(e));
      }
    })();
    (async () => {
      try {
        const data = await fetchAnomalies(code);
        if (!cancelled) {
          setAnomalyItems(data.items);
          setAnomaliesLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setAnomaliesError(String(e));
          setAnomaliesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="px-6 py-6 bg-surface-expanded border-t border-rule">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div>
          <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-2">
            Last 90 days
          </div>
          {pricesError ? (
            <div className="text-sm text-loss">
              could not load price history: {pricesError}
            </div>
          ) : points === null ? (
            <div className="text-sm text-quiet italic h-[220px] flex items-center">
              loading chart…
            </div>
          ) : (
            <PriceChart points={points} direction={direction} />
          )}
        </div>

        <div className="flex flex-col gap-7">
          <InsightBlock code={code} />
          <NotesBlock code={code} />
          <div>
            <AnomalyBlock
              items={anomalyItems}
              loading={anomaliesLoading}
              error={anomaliesError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

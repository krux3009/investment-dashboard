/**
 * /portfolio Analysis tab. Mirrors SimplyWall.st's Analysis surface:
 *   • 5 axis sub-tabs: Valuation (default) / Future / Past / Health /
 *     Dividends. Only Valuation has data right now — Future / Past /
 *     Health / Dividends defer to snowflake statement cards inline
 *     in the drill-in (P6).
 *   • Diversification section: Sectors + Geography + Top 10 Holdings.
 *
 * Data sources:
 *   • /api/portfolio/valuation                   — cash-flow value
 *   • /api/portfolio/{pe,ps,peg}-vs-market       — three gauges
 *   • /api/portfolio/sectors                     — sector buckets
 *   • /api/portfolio/geography                   — region buckets
 *   • /api/portfolio/top-holdings?n=10           — top-10 by weight
 *
 * This file stays a thin SERVER component: it does the data fetch, then
 * hands the (possibly null) data to <AnalysisView>, a client component
 * that holds all presentation + i18n (analysis-view.tsx).
 */

import {
  fetchGeography,
  fetchPegGauge,
  fetchPeGauge,
  fetchPsGauge,
  fetchSectors,
  fetchTopHoldings,
  fetchValuation,
} from "@/lib/api";
import { AnalysisView } from "./analysis-view";

async function safe<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`fetch ${label} failed:`, e);
    return null;
  }
}

export async function AnalysisTab() {
  const [valuation, pe, ps, peg, sectors, geography, topHoldings] = await Promise.all([
    safe(() => fetchValuation(), "valuation"),
    safe(() => fetchPeGauge(), "pe-vs-market"),
    safe(() => fetchPsGauge(), "ps-vs-market"),
    safe(() => fetchPegGauge(), "peg-vs-market"),
    safe(() => fetchSectors(), "sectors"),
    safe(() => fetchGeography(), "geography"),
    safe(() => fetchTopHoldings(10), "top-holdings"),
  ]);

  return (
    <AnalysisView
      valuation={valuation}
      pe={pe}
      ps={ps}
      peg={peg}
      sectors={sectors}
      geography={geography}
      topHoldings={topHoldings}
    />
  );
}

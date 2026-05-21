/**
 * /portfolio Dividends tab. Mirrors SimplyWall.st's Dividends surface:
 *   • Next 12m Income hero card
 *   • Monthly Income / Current Yield / Yield on Cost stats
 *   • Dividend History monthly bars (rolling 16 months)
 *   • Largest / Smallest contributor lists
 *   • Dividend Quality & Forecast buckets card
 *   • Forward dividend forecast (12m / 24m / 36m toggle)
 *   • Per-holding table
 *
 * Data sources:
 *   • /api/dividends                       — existing ledger
 *   • /api/dividends/forecast?horizon=…    — forecast rows
 *   • /api/dividends/quality-buckets       — quality bucket counts
 *
 * This file stays a thin SERVER component: it does the data fetch, then
 * hands the (possibly null) data to <DividendsView>, a client component
 * that holds all presentation + i18n (dividends-view.tsx).
 */

import {
  fetchDividendForecast,
  fetchDividendQualityBuckets,
  fetchDividends,
} from "@/lib/api";
import { DividendsView } from "./dividends-view";

async function safe<T>(p: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await p();
  } catch (e) {
    console.warn(`fetch ${label} failed:`, e);
    return null;
  }
}

export async function DividendsTab() {
  const [ledger, forecast12, buckets] = await Promise.all([
    safe(() => fetchDividends(), "/dividends"),
    safe(() => fetchDividendForecast("12m"), "/dividends/forecast"),
    safe(() => fetchDividendQualityBuckets(), "/dividends/quality-buckets"),
  ]);

  return <DividendsView ledger={ledger} forecast={forecast12} buckets={buckets} />;
}

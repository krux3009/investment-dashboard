/**
 * /portfolio Returns tab. Mirrors SimplyWall.st's Returns surface:
 *   • Breakdown stacked-bar (unrealized + realized + dividends + currency)
 *   • Highest / Lowest contributor lists
 *   • Detailed Returns Report table
 *   • CSV download button
 *
 * Data sources:
 *   • /api/returns/summary   — top stacked-bar inputs
 *   • /api/returns/contributors  — top + bottom lists
 *   • /api/returns/detail    — table rows + CSV source
 *
 * realized_usd + currency_impact_usd come back as 0 with partial=true
 * because moomoo OpenD doesn't expose realized P&L or transaction
 * history. Those segments + columns render greyed.
 *
 * This file stays a thin SERVER component: it does the data fetch, then
 * hands the (possibly null) data to <ReturnsView>, a client component
 * that holds all presentation + i18n (returns-view.tsx).
 */

import {
  fetchReturnsSummary,
  fetchReturnsDetail,
  type ReturnsSummary,
  type ReturnsDetail,
} from "@/lib/api";
import { ReturnsView, type ContributorsResponse } from "./returns-view";

async function safeFetchAll() {
  const [summary, detail, contributors] = await Promise.all([
    safeFetchSummary(),
    safeFetchDetail(),
    safeFetchContributors(),
  ]);
  return { summary, detail, contributors };
}

async function safeFetchSummary(): Promise<ReturnsSummary | null> {
  try {
    return await fetchReturnsSummary();
  } catch (e) {
    console.warn("fetchReturnsSummary failed:", e);
    return null;
  }
}

async function safeFetchDetail(): Promise<ReturnsDetail | null> {
  try {
    return await fetchReturnsDetail();
  } catch (e) {
    console.warn("fetchReturnsDetail failed:", e);
    return null;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

async function safeFetchContributors(): Promise<ContributorsResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/returns/contributors?n=5`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ContributorsResponse;
  } catch (e) {
    console.warn("fetchReturnsContributors failed:", e);
    return null;
  }
}

export async function ReturnsTab() {
  const { summary, detail, contributors } = await safeFetchAll();
  return <ReturnsView summary={summary} detail={detail} contributors={contributors} />;
}

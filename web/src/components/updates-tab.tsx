/**
 * /portfolio Updates tab. SimplyWall.st mirrors a counter-badged
 * Updates feed in the same slot; we map that to the existing
 * ForesightBlock surface (per-holding earnings, macro releases, and
 * Claude-curated company events) defaulted to a 30-day window.
 *
 * Data source: /api/foresight?days=30.
 *
 * This file stays a thin SERVER component: it does the data fetch, then
 * hands the (possibly null) data to <UpdatesView>, a client component
 * that holds the header chrome + i18n (updates-view.tsx).
 */

import { fetchForesight } from "@/lib/api";
import type { ForesightResponse } from "@/lib/api";
import { UpdatesView } from "@/components/updates-view";

async function safeFetchForesight(): Promise<ForesightResponse | null> {
  try {
    return await fetchForesight(30);
  } catch (e) {
    console.warn("fetchForesight (updates tab) failed:", e);
    return null;
  }
}

export async function UpdatesTab() {
  const foresight = await safeFetchForesight();
  return <UpdatesView foresight={foresight} />;
}

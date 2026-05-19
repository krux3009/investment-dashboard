/**
 * /portfolio Updates tab. SimplyWall.st mirrors a counter-badged
 * Updates feed in the same slot; we map that to the existing
 * ForesightBlock surface (per-holding earnings, macro releases, and
 * Claude-curated company events) defaulted to a 30-day window.
 *
 * Data source: /api/foresight?days=30.
 */

import { fetchForesight } from "@/lib/api";
import type { ForesightResponse } from "@/lib/api";
import { ForesightBlock } from "@/components/foresight-block";

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
  if (!foresight) {
    return (
      <section className="rounded-xl border border-dashed border-rule bg-surface-raised p-10 text-center">
        <p className="text-sm font-medium text-ink">Updates feed unavailable.</p>
        <p className="mt-2 text-xs text-quiet">
          Backend unreachable — check the FastAPI server on port 8000.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-medium text-ink">Updates Feed</h2>
          <p className="text-xs text-quiet">
            Per-holding earnings, ex-dividends, macro releases, and curated
            company events across the next 30 days.
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">
          {foresight.events.length} events
        </p>
      </header>
      <ForesightBlock initial={foresight} />
    </div>
  );
}

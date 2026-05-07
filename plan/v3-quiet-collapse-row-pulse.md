# Plan — Quiet-row collapse + per-row tick pulse (2026-05-07 evening)

## Context

Two carryover items from `sessions/2026-05-07.md` "Improvements for next session":

1. **Quiet-row collapse (item #2).** Today on `/`, K71U renders 3 of 4 tiles
   as `Quiet on …` text — F + S + T are quiet, only News has signal. The
   row reads sparse and visually unbalanced beside denser tickers. When a
   ticker is quiet on ≥3 of 4 dimensions, collapse those quiet tiles into
   a single line `K71U · quiet across F/S/T` and keep the active tile
   (News) inline. Reduces visual noise on slow days without hiding signal.

2. **Per-row tick pulse (item #3).** D5 introduced `useTickPulse` (used
   only on Hero today) plus the `.tick-pulse-cell` 600ms warm-graphite
   animation. HoldingsTable + WatchlistTable take live SSE overlays but
   render values silently — no animation cue when a row's data
   changes. Add a per-row pulse: when any of a row's live fields
   changes, the whole row tints once. Keeps principle-#2
   calm-under-volatility (no green/red, no shift).

Bundle both in one branch + PR — both are small, isolated to the
client + a tiny digest-payload addition.

## Approach

### Part 1 — Quiet-row collapse

Plumb the existing backend `is_quiet` boolean through the digest payload
and let the client render a collapsed variant when ≥3 of 4 tiles are
quiet. Drops the brittle client-side regex
`/^Quiet on .* this week\.?$/i` that today couples UI behavior to the
exact fallback string.

**Backend.**
- `src/api/digest.py:57-65` — extend `TickerTiles` dataclass with 4
  booleans: `fundamentals_quiet`, `news_quiet`, `sentiment_quiet`,
  `technical_quiet`. Source the booleans from each analyst's
  `AnalystOutput.is_quiet` (already produced — see `_base.py:48`,
  `_quiet()` at `_base.py:51-55`). The `call_analyst` call sites in
  the four analyst modules already return `AnalystOutput`; the
  per-tile orchestration in `digest.py` just needs to propagate
  `.is_quiet` alongside `.sentence`.
- `src/api/routes/digest.py:32-47` — add the 4 booleans to the
  response dict.
- **Cache key unchanged.** `_PROMPT_VERSION = "v3"` stays. `is_quiet`
  is derived from analyst output, not prompt content; existing v3 cache
  rows still produce correct booleans on read because `_quiet()` is
  deterministic (empty context → `is_quiet=True`).
- **No retire of cache table.** The boolean is added to the
  in-memory dataclass + JSON response only. The DuckDB cache row
  still stores the sentence string only.

**Frontend.**
- `web/src/lib/api.ts:126-140` — extend `TickerTiles` interface with
  the 4 quiet booleans.
- `web/src/components/daily-digest.tsx:44-65` — drop the regex on
  line 51. Pass `isQuiet` as a prop to `<Tile>` from the parent
  loop. Tile component still renders italic-whisper styling unchanged.
- `web/src/components/daily-digest.tsx:147-168` — in the per-ticker
  loop, count quiet booleans. When `quietCount >= 3`, render a
  collapsed row instead of the 4-tile grid:
  - Layout: `grid grid-cols-1 md:grid-cols-[6rem_1fr]` (ticker
    column + collapsed-content column).
  - Content (left of any active tile):
    `quiet across F/S/T` (or whichever dims are quiet — derive
    initials from `TILE_LABELS`). Wrap in same italic-whisper
    styling as a single quiet tile so it reads as muted.
  - The 1 active tile (if any) renders inline beside the collapsed
    text in the same row; same `<Tile>` component, no re-style.
  - When `quietCount === 4`, render only the collapsed line, no
    active tile.

**Threshold = 3 of 4 (per user choice).** Encoded as the literal
constant `QUIET_COLLAPSE_THRESHOLD = 3` near the top of
`daily-digest.tsx`.

### Part 2 — Per-row tick pulse

Extract row JSX into `<HoldingRow>` and `<WatchlistRow>` components.
Each row hashes its live fields, calls `useTickPulse(hash)`, and applies
`.tick-pulse-cell` to all `<td>` children when pulsing. `<tr>`
background-color is unreliable cross-browser, so the existing
cell-level CSS class is reused by gating it on a single per-row
boolean instead.

**Reuse, don't add:**
- `useTickPulse(value, ms=600)` already exists at
  `web/src/lib/use-tick-pulse.ts:1-29`. Accepts `unknown`. Pass a
  string hash.
- `.tick-pulse-cell` keyframe + class already at
  `web/src/app/globals.css:108-120`. Reuse as-is. `padding: 0 4px;
  margin: 0 -4px` works on `<td>` because the row's columns already
  have horizontal padding.
- `prefers-reduced-motion` handled globally at `globals.css:123-125`
  — no per-component branching needed.

**HoldingsTable** — `web/src/components/holdings-table.tsx`.
- Lines 177-334 (the `sorted.map((h) => …)` body) → extract into
  a `<HoldingRow h={Holding} isExpanded onToggle direction />`
  component near top of file.
- Inside `HoldingRow`:
  ```tsx
  const hash = `${h.current_price}|${h.today_change_pct}|${h.market_value_usd}|${h.total_pnl_pct}`;
  const pulsing = useTickPulse(hash);
  ```
  Pulse fields chosen to match what the SSE tick actually mutates
  (price + today_pct + derived value + total_pnl_pct — see
  `holdings_payload.py` + `realtime.py`). Static fields like ticker
  and qty excluded so a no-op SSE tick (same prices) doesn't pulse.
- Apply `tick-pulse-cell` className to each `<td>` when `pulsing`.
  Cleanest: a small helper inside the component
  `const cellCls = pulsing ? "tick-pulse-cell" : ""` and merge with
  existing per-cell classes via the existing `cn()` util at
  `web/src/lib/utils.ts:1-5`.

**WatchlistTable** — `web/src/components/watchlist-table.tsx`.
- Lines 65-149 (the `codes.map((code) => …)` body) → extract into
  `<WatchlistRow code quote liveQuote sparklineData isExpanded onToggle direction />`
  near top of file.
- Hash: `${liveQuote?.last_price ?? ""}|${liveQuote?.today_change_pct ?? ""}`.
  Watchlist live store carries fewer fields than holdings (see
  `live-store.ts:10-13` — `LiveWatchlistQuote` is just `code +
  last_price + today_change_pct`).
- Same per-`<td>` `tick-pulse-cell` treatment.

## Critical files

Backend:
- `src/api/digest.py` — extend `TickerTiles` dataclass (`:57-65`) +
  populate booleans where `AnalystOutput` results are merged into
  the per-ticker tile bundle.
- `src/api/routes/digest.py:32-47` — propagate booleans in
  response dict.

Frontend:
- `web/src/lib/api.ts:126-140` — `TickerTiles` interface +4
  booleans.
- `web/src/components/daily-digest.tsx` — drop regex; add
  collapsed-row variant; threshold constant.
- `web/src/components/holdings-table.tsx` — extract `<HoldingRow>`,
  add `useTickPulse(hash)`, conditionally apply `tick-pulse-cell`.
- `web/src/components/watchlist-table.tsx` — extract
  `<WatchlistRow>`, same pattern.

No changes to: `_base.py`, analyst modules, prompt, cache schema,
SSE broadcaster, live-store selectors, CSS.

## Verification

Backend:
1. `uv run api` (background, log to `tmp/api.log`).
2. `curl -s localhost:8000/api/digest | jq '.holdings[0]'` — confirm
   response includes 4 new boolean fields. K71U should have
   `fundamentals_quiet`/`sentiment_quiet`/`technical_quiet` true,
   `news_quiet` false (or whatever the live data says).
3. `curl -s 'localhost:8000/api/digest?refresh=true' | jq '.cached'`
   → `false`. Then re-curl without `refresh` → `true`. Cache still
   works.
4. Spot-check that no `Quiet on …` sentence corresponds to
   `is_quiet=false` and vice versa (consistency between sentence
   and boolean).

Frontend (`cd web && npm run dev`, log to `../tmp/web.log`):
5. `localhost:3000/` — K71U row renders as collapsed line
   `K71U · quiet across F/S/T` + News tile inline. Active tickers
   (e.g. NVDA) keep the full 4-tile grid. Theme toggle cycles
   light/dark/system without breaking the collapsed line styling.
6. `localhost:3000/portfolio` — open during US RTH. Watch for
   ~600ms warm-tint pulse on a row when its price ticks. No
   pulse on the row of an unchanged holding. Sort + expand still
   work. Expanded drill-in unaffected.
7. `localhost:3000/watchlist` — same pulse check. SSE indicator
   in footer reads `Live · last tick HH:MM:SS SGT`.
8. DevTools → emulate `prefers-reduced-motion: reduce` → values
   still update silently, no animation.
9. Re-check on a no-tick row across two SSE pushes (price
   unchanged) — confirm hash equality skips the pulse.

Out-of-RTH verification (if shipping evening SGT, US market closed):
10. Pulse can be smoke-tested by manually dispatching a fake
    `tick` event from devtools or by temporarily lowering the
    broadcaster's hours-gate. Otherwise visual confirmation
    waits until next US RTH session.

## Out of scope tonight

- Quiet-fallback retry-rate dashboard check (carryover #6) —
  needs ~24h of v3 traffic, do at next session start.
- Async-warm cache lifespan task (#4).
- Tile prompt v4 (#5) — watch a few days.
- Per-row pulse on Hero — already pulses fields individually,
  fine.

## PR shape

Single branch + single PR for both items. Title:
`v3 quiet-row collapse + per-row tick pulse`. Body summarizes
the two changes separately for reviewers.

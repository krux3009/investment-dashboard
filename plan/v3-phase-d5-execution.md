# Phase D · D5 — Real-time SSE price push

## Context

The dashboard today refreshes data only on route navigation
(`fetch(.., { cache: 'no-store' })` per Server-Component render).
Numbers go stale the instant the page settles. Every other surface
in `plan/v3-phase-d.md` has shipped (D1 notes, D2 benchmark, D3
concentration, +foresight); D4 mobile is being deferred per user
direction this session.

D5 is now active. Goal: prices, today-Δ%, and USD P&L tick live on
all three surfaces (Hero, Holdings, Watchlist) without a reload,
using a single Server-Sent-Events stream from FastAPI to the
browser. Cadence **20s**, **gated to US Regular Trading Hours**, no
moomoo subscribe path (snapshot-poll only — the "smaller version
first" the parking note in `plan/v3-phase-d.md:296-300` describes).
Visual: subtle pulse on changed cells, no flashing colors —
principle-#2 calm-under-volatility holds.

## Recommended approach

A single backend broadcaster drives one snapshot fetch per tick;
all connected SSE clients fan out from that one fetch via per-client
`asyncio.Queue`. The frontend opens one `EventSource` from a
top-level provider; components read sliced live state from a
React-Context store (Zustand-style API, dep-free implementation).
P&L math stays server-side — broadcaster reuses the existing
holdings aggregation path (`fetch_positions` + `fx.convert`), just
re-emits at 20s.

Why this shape:
- **One fetch → many clients.** Single-user repo today, but the
  fan-out costs ~10 lines and protects against future "two browser
  tabs open" hammering moomoo.
- **Server-side recompute.** All P&L / FX math is already in
  Python (`src/api/routes/holdings.py:20-68`). Push the recomputed
  payload; frontend swaps values, no client logic.
- **No global state lib.** Tiny Context+reducer beats adding
  Zustand for one feature.
- **No moomoo subscribe.** `get_market_snapshot([codes])` (already
  wrapped in `src/api/data/quotes.py`) is sufficient at 20s and
  doesn't burn subscription quota.

## Architecture

```
Backend
  src/api/market_hours.py        ← NEW · is_us_rth(now) using zoneinfo + holiday list
  src/api/realtime.py            ← NEW · Broadcaster: async loop, fan-out, RTH gate
  src/api/routes/stream.py       ← NEW · /api/stream/prices SSE endpoint
  src/api/main.py                ← MOD · lifespan ctx mgr; register stream router
  src/api/data/moomoo_client.py  ← MOD · expose `recompute_summary(positions, fresh_quotes)`
                                          extracted from `_summarize()` so broadcaster
                                          can reuse the same aggregation as the REST path

Frontend
  web/src/lib/live-store.ts          ← NEW · createStore<LiveState>() — useSyncExternalStore-based,
                                              dep-free, per-key subscribers (so a Hero update
                                              does not re-render every holdings row)
  web/src/lib/use-live-prices.ts     ← NEW · provider hook: opens EventSource, dispatches to store
  web/src/components/live-indicator.tsx  ← NEW · footer "· last tick 14:03:21 SGT · live"
                                                 / "Market closed · next open 21:30 SGT"
  web/src/components/hero.tsx            ← MOD · live total + P&L override SSR initial
  web/src/components/holdings-table.tsx  ← MOD · live price/Δ/P&L per row, tick-pulse class
  web/src/components/watchlist-table.tsx ← MOD · live price/Δ per row, tick-pulse class
  web/src/app/page.tsx                   ← MOD · wrap with <LivePricesProvider>
  web/src/app/portfolio/page.tsx         ← MOD · same
  web/src/app/watchlist/page.tsx         ← MOD · same
  web/src/app/globals.css                ← MOD · @keyframes tick-pulse + .tick-pulse-cell;
                                                  prefers-reduced-motion → animation: none
```

### SSE wire format

One event type `tick` (full state, no diffs — keeps client logic
trivial; payload ~3-5 KB which is fine at 20s):

```
: keepalive                                              # every 15s, SSE comment, no event
event: tick                                              # every 20s during US RTH
data: {"server_ts": 1714989612,
       "market": "open",
       "total_market_value_usd": 142981.04,
       "total_pnl_abs_usd": 8214.31,
       "total_pnl_pct": 0.0610,
       "holdings": [{"code":"US.NVDA","last_price":...,"today_change_pct":...,
                     "market_value_usd":...,"total_pnl_abs_usd":...,
                     "total_pnl_pct":...}, ...],
       "watchlist": [{"code":"US.SMH","last_price":...,"today_change_pct":...}, ...]}

event: market_status                                     # on RTH transitions only
data: {"market": "closed", "next_open_iso": "2026-05-07T13:30:00Z"}
```

Initial connect: broadcaster sends current cached state immediately
(or `market_status: closed` if pre-RTH). Reconnect: EventSource
auto-reconnects with backoff; we always push full state so no
`Last-Event-ID` resume logic needed.

### US RTH gate

`market_hours.py:is_us_rth(now: datetime)`:
- Convert to `America/New_York`.
- Weekday check (Mon-Fri).
- 09:30 ≤ time < 16:00.
- Exclude NYSE holidays from a hardcoded 2026-2027 list (no new dep
  for D5; can swap to `pandas_market_calendars` if more years
  needed later).

When out of RTH the broadcaster:
- Skips snapshot fetches (zero moomoo calls).
- Emits `keepalive` comment every 15s (proxy survival).
- Emits one `market_status: closed` on the transition.
- Computes `next_open_iso` with the same RTH logic.

### Recompute path reuse

Broadcaster pseudocode:

```python
positions_cache: list[Position] | None = None  # full position list, refreshed every 5 min
positions_cache_at: datetime | None = None

async def tick():
    if not is_us_rth(now()):
        return  # broadcaster loop schedules market_status emit only on transitions
    if positions_cache is None or stale(positions_cache_at, minutes=5):
        positions_cache = await asyncio.to_thread(fetch_positions)
    codes = [p.code for p in positions_cache] + watchlist_codes
    fresh = await asyncio.to_thread(_quote_ctx().get_market_snapshot, codes)
    overlaid = overlay_snapshot(positions_cache, fresh)            # local copy, no mutation of cache
    summary = recompute_summary(overlaid)                          # extracted from moomoo_client._summarize
    payload = build_payload(summary, fresh, watchlist_codes)
    for q in subscribers: q.put_nowait(payload)
```

Cached quote wrapper at `src/api/data/quotes.py:get_quotes` is
**bypassed** by the broadcaster — its 30s TTL would mask fresh
data at 20s cadence. REST routes keep using it (no behavior change
for non-stream callers).

## Visual treatment (subtle feedback per design principle #2)

- **Per-cell tick-pulse.** When a numeric cell value changes, add
  class `tick-pulse-cell` for 600ms. Animation: background-color
  fades from `var(--accent-tint)` (a new mid-light token, sat ≤8%)
  to `transparent`. **No green/red, no scale, no row shift.**
- **Hero live dot.** A faint `•` next to the total, opacity tweens
  0.4 → 0.9 → 0.4 on each tick over 600ms. Same restraint.
- **Footer indicator.** New `<LiveIndicator />` rendered once near
  the page bottom: `· last tick 14:03:21 SGT · live`, mono small
  caps. Switches to `Market closed · next open 21:30 SGT` outside
  RTH. Provides a single source of truth that the stream is alive.
- **`prefers-reduced-motion`.** All animations gated to `@media
  (prefers-reduced-motion: no-preference)`. Reduced-motion users
  see numbers swap silently — same end state.

## Critical files

**Created**
- `src/api/market_hours.py`
- `src/api/realtime.py`
- `src/api/routes/stream.py`
- `web/src/lib/live-store.ts`
- `web/src/lib/use-live-prices.ts`
- `web/src/components/live-indicator.tsx`

**Modified**
- `src/api/main.py` — `lifespan` ctx mgr to start/stop broadcaster, close `_quote_ctx()` on shutdown; register `stream.router`
- `src/api/data/moomoo_client.py` — extract `recompute_summary(positions)` from internal `_summarize` (lines 249-281) so broadcaster reuses identical math
- `src/api/data/quotes.py` — no change; broadcaster bypasses `get_quotes` and calls `_quote_ctx().get_market_snapshot` directly with its own 20s rhythm
- `src/api/fx.py` — no code change; usage unchanged (`fx.convert` is thread-safe per its `_LOCK`)
- `web/src/components/hero.tsx`
- `web/src/components/holdings-table.tsx`
- `web/src/components/watchlist-table.tsx`
- `web/src/app/page.tsx` · `/portfolio/page.tsx` · `/watchlist/page.tsx` — wrap in `<LivePricesProvider>`
- `web/src/app/globals.css` — keyframes + `.tick-pulse-cell`, new `--accent-tint` token in dark + light blocks
- `CLAUDE.md` — bump §Status to "D5 shipped" + Surfaces blurb on the live indicator

**Reused (read-only)**
- `src/api/data/anomalies.py:_quote_ctx()` (60-73) — shared `OpenQuoteContext`
- `src/api/data/moomoo_client.py:fetch_positions()` (96-194) — initial + 5-min refresh
- `src/api/fx.py:convert()` (56-92) — thread-safe FX conversion
- `src/api/routes/watchlist.py` — codes resolution unchanged

## Implementation order (single sitting; commit per chunk)

1. **Backend skeleton.** `market_hours.py` + tests-by-eye in REPL.
   `realtime.py` Broadcaster (no SSE yet, just print to log every
   20s during RTH). `stream.py` SSE route. Lifespan in `main.py`.
   Verify `curl -N localhost:8000/api/stream/prices` shows `tick`
   events at 20s during RTH, `keepalive` outside.

2. **Recompute extraction.** Pull `_summarize` body into a public
   `recompute_summary` callable in `moomoo_client.py`. Broadcaster
   uses it. REST `/api/holdings` now also calls it (no behavior
   change). One quick `curl -s localhost:8000/api/holdings` diff
   should be byte-identical.

3. **Frontend store + hook.** `live-store.ts` (~40 lines:
   `createStore`, `subscribe`, `setState`, `getState` slice
   helpers). `use-live-prices.ts` provider component opens
   EventSource, dispatches `tick` events into the store, handles
   reconnect/error, returns selectors.

4. **Wire surfaces.** Hero, HoldingsTable, WatchlistTable read
   live state with fallback to SSR initial. Tick-pulse class on
   change (effect compares prev/new value, toggles class for
   600ms).

5. **Live indicator + market-status banner.** `<LiveIndicator />`
   pinned to footer area on each page.

6. **CSS.** `@keyframes tick-pulse`, `.tick-pulse-cell`, new
   `--accent-tint` token in `:root` + `.dark`. `prefers-reduced-motion`
   guard.

7. **Docs.** `CLAUDE.md` §Status + Surfaces; brief mention in §Run.

## Branch / PR strategy

This is the first feature shipping under the new collaboration
workflow:

```bash
git checkout -b lixuan/d5-realtime-sse
# implement, commit per chunk
git push -u origin lixuan/d5-realtime-sse
gh pr create --fill
```

Owner-merge via admin bypass (already configured) since
`DalegendaryCat` invite is still pending. Once collaborator joins,
they review subsequent PRs.

## Out of scope (stays parked)

- moomoo `subscribe()` tick-by-tick stream (subscription quota
  cost; 20s snapshot already covers principle-#2 design ceiling)
- Pre/post-market push (RTH only — extending later is a one-line
  predicate change)
- Mobile responsive breakpoints (D4, deferred)
- Push notifications to phone (different feature; if wanted later
  it's web-push or APNs, not SSE)
- Sparkline live updates (sparklines are 30-day daily bars; intra-
  day point would distort scale)

## Verification

After all chunks ship:

1. **Backend stream:** `curl -N localhost:8000/api/stream/prices`
   prints `tick` events at 20s ± a few ms during RTH; `keepalive`
   comments every 15s outside RTH; one `market_status: closed`
   event right after market close, one `market_status: open` right
   after market open.
2. **REST byte-identity:** `curl -s localhost:8000/api/holdings`
   returns identical JSON before and after the `_summarize` →
   `recompute_summary` extraction.
3. **Browser:** With dev server up, network tab shows one
   `EventSource` with `text/event-stream` content-type. Hero total
   + P&L update silently every 20s during RTH; holdings + watchlist
   rows update silently. Cells that changed pulse for ~600ms in
   warm-graphite tint, no green/red flash. Footer reads e.g.
   `· last tick 14:03:21 SGT · live`. `prefers-reduced-motion`:
   numbers swap, no animation.
4. **Out-of-RTH:** Footer reads `Market closed · next open
   21:30 SGT`. No moomoo calls in logs. Reconnects survive
   sleep/wake.
5. **Two tabs:** Open `/` and `/portfolio` in two tabs; both
   receive ticks. Backend logs show one snapshot fetch per 20s
   tick total (not two).
6. **Restart:** `Ctrl-C` the API server, dashboard reconnects when
   `uv run api` is back. No console error spam during the gap.
7. **Forbidden-words scan** is irrelevant for D5 (no new advisor
   prose); skip.

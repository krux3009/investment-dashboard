# v3 Phase D — Polish + future hooks

## Context

Phase A (FastAPI + Next.js + `/api/holdings` end-to-end), Phase B
(visual parity then Dash retired), and Phase C (daily digest +
upcoming earnings + tomorrow's preview, all on the static-baseline +
lazy-Claude-depth pattern) all shipped. The dashboard is functionally
complete on FastAPI + Next.js + Tailwind 4 + Recharts + Anthropic SDK.

Phase D was deferred from `plan/v3-stack-rewrite.md` as "polish + future
hooks": real-time push, position notes, performance vs benchmark,
concentration alerts, plus mobile responsive layout from §"Out of
scope". This plan locks an order across those five candidates,
specifies each as an independently shippable chunk, and articulates
why one of them (real-time push) likely stays parked.

This plan is the multi-session roadmap for D. Each chunk is one
sitting; concrete per-chunk execution plans land in
`plan/v3-phase-d-chunkN-<slug>.md` when that chunk is picked up.

## Decisions locked in this plan

- **Order: D1 notes → D2 benchmark → D3 concentration → D4 mobile →
  D5 real-time (probably-parked).** Notes ships first because it is
  lowest risk and sets the DuckDB persistence pattern that benchmark
  history reuses. Benchmark + concentration both serve weekend-study
  mode and stack cleanly on the existing data layer. Mobile refines
  daily-glance mode after the surfaces are stable. Real-time remains
  deferred — see §D5 for the reasoning to revisit.
- **Notes persistence: server-side DuckDB.** Single-user local app,
  no sync concern, survives browser clears, fits the existing
  single-writer model with `_DB_LOCK`. IndexedDB rejected — loses
  data on browser switch and adds a second source of truth.
- **Benchmark default: SPY, env-overridable.** Set
  `MOOMOO_BENCHMARKS=SPY,SMH` (or similar) to render multiple lines
  without code change. SMH matches the AI-infra thesis when needed;
  SPY is the universal baseline.
- **Concentration framing: observational only.** Ratios and FX
  exposure render as quiet captions and tabular figures. No alert
  thresholds, no traffic lights, no copy that suggests action.
  See `~/.claude/projects/-Users-tanlixuan-Me-Vault/memory/feedback_financial_framing.md` —
  no buy / sell / hold / target / forecast / predict / recommend /
  "you should" anywhere in this phase.
- **Reuse the Phase C advisor pattern.** Where a chunk wants Claude
  context (benchmark commentary, concentration commentary), copy the
  static-baseline + lazy-fetch + `_PROMPT_VERSION` cache-key shape
  from `digest.py` / `insight.py` / `earnings_insight.py`. Don't
  invent a new pattern.
- **No new ports, no new processes.** All chunks fit inside the
  existing FastAPI + Next.js shells. No new backend service.

## Architecture deltas (per chunk)

```
src/api/
├── notes.py                 ← D1: CRUD against DuckDB notes table
├── benchmark.py             ← D2: yfinance SPY/etc + DuckDB cache
├── benchmark_insight.py     ← D2: Claude commentary, advisor pattern
├── concentration.py         ← D3: ratios + FX exposure computation
├── concentration_insight.py ← D3: Claude commentary, advisor pattern
├── data/
│   └── notes.py             ← D1: notes table + helpers
└── routes/
    ├── notes.py             ← D1: GET/PUT /api/notes/{code}
    ├── benchmark.py         ← D2: /api/benchmark, /api/benchmark/series
    ├── benchmark_insight.py ← D2: /api/benchmark-insight
    └── concentration.py     ← D3: /api/concentration
                                  /api/concentration-insight

web/src/components/
├── notes-block.tsx          ← D1
├── benchmark-block.tsx      ← D2
├── benchmark-chart.tsx      ← D2 (Recharts, lazy)
├── concentration-block.tsx  ← D3
└── (existing components gain mobile classes — D4)
```

DuckDB schema additions (one migration each, applied at first import):

```sql
-- D1
CREATE TABLE IF NOT EXISTS notes (
  code VARCHAR PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- D2
CREATE TABLE IF NOT EXISTS benchmark_prices (
  symbol VARCHAR,
  trade_date DATE,
  close DOUBLE,
  PRIMARY KEY (symbol, trade_date)
);
```

Concentration (D3) is pure computation off existing positions — no
new table.

## Phased roadmap

### D1 — Position notes (1 sitting)

**Goal.** Per-ticker freeform prose persisted across sessions, surfaced
inside the holdings drill-in (and watchlist drill-in by symmetry).
Lets the weekend-study mode capture a thesis sentence next to the
data instead of bouncing to Me Vault.

**Backend.**
- `data/notes.py` — schema migration, `get_note(code) -> Note | None`,
  `put_note(code, body) -> Note`, `delete_note(code)`. Reuse
  `_DB_LOCK` from `data/prices.py`.
- `routes/notes.py` — `GET /api/notes/{code}` (200 with body, 404 if
  empty), `PUT /api/notes/{code}` (idempotent upsert, 200 with body),
  `DELETE /api/notes/{code}` (204).

**Frontend.**
- `notes-block.tsx` — collapsed view shows the first line + char count;
  expanded view is a `<textarea>` with a debounced auto-save
  (`PUT` after 800ms of idle typing). `aria-label="Notes for {code}"`.
- Slot the block into the holdings drill-in between the price chart
  and the anomaly section. Same in the watchlist drill-in.
- Empty state: a single italic placeholder line ("No notes yet.")
  in warm-graphite, not a CTA. The block itself is the affordance.

**Out of scope this chunk.** Notes search, multi-line markdown
rendering, image attachments, version history. The textarea is the
whole interface.

**Verification.**
- `curl -X PUT localhost:8000/api/notes/US.NVDA -d '{"body":"..."}' -H 'Content-Type: application/json'` round-trips.
- Reopen the drill-in after a server restart — note still there.
- Two browsers reading the same note see the same content (sanity
  check that DuckDB is the source of truth, not browser storage).

---

### D2 — Performance vs benchmark (1 sitting)

**Goal.** A single chart in the hero (or directly under it) showing
portfolio total-return % vs benchmark total-return % over a chosen
window (default 90D, toggle 30D / 1Y / All). Observational only — the
chart shows the relationship; no copy says you're "beating" or
"lagging" anything.

**Backend.**
- `benchmark.py` — `get_series(symbol, days)` via yfinance, cached in
  `benchmark_prices` table. Daily granularity. Refresh policy: TTL
  ~6h (matches typical daily-glance cadence).
- Portfolio series is computed off the existing `prices` table for
  held tickers, weighted by current quantity (no historical
  reconstruction — this is a current-snapshot weighting projected
  back, with that limitation called out in the chart caption).
- `routes/benchmark.py` — `GET /api/benchmark?days=90&symbols=SPY,SMH`
  → `{ portfolio: [...], benchmarks: { SPY: [...], SMH: [...] }, as_of, weighting_caveat }`.
- `benchmark_insight.py` — advisor-pattern Claude block keyed on
  `(symbols, days, as_of_date)`. Prompt: "Describe in 2 sentences how
  the portfolio's path differs from each benchmark over the window.
  No buy/sell/hold/target/forecast/predict/recommend/should language.
  Plain English, no jargon." Server-cached 6h, `_PROMPT_VERSION` field.

**Frontend.**
- `benchmark-block.tsx` — header line ("Portfolio vs SPY · 90 days"),
  Recharts line chart (lazy-mounted, drill-in pattern to avoid SSR
  measurement issues), window-toggle buttons, [learn more] toggle
  for the Claude commentary.
- Hand-rolled SVG fallback path for first paint if Recharts is
  expensive — match Phase B's approach to charts in SSR HTML.
- Tabular legend below the chart: portfolio %Δ + each benchmark %Δ
  for the active window.

**Out of scope this chunk.** Risk-adjusted returns (Sharpe, etc.),
attribution by position, sector breakdown vs benchmark sectors,
historical reweighting (so the line is "if I held today's weights
the whole window"). Caveat sits in the caption.

**Verification.**
- `curl -s 'localhost:8000/api/benchmark?days=90' | jq '.portfolio | length'` ≥ 60.
- `MOOMOO_BENCHMARKS=SPY,SMH` env var renders two benchmark lines
  with no code change.
- Chart respects theme toggle (no hardcoded colors).
- Commentary block contains zero forbidden words; rerun with one
  prompt-edit cycle to confirm `_PROMPT_VERSION` invalidation works.

---

### D3 — Concentration observations (1 sitting)

**Goal.** A small panel beneath the holdings table summarizing the
shape of the book: top-N share, currency exposure, single-name share.
No thresholds, no traffic lights, no recommendations. Just the
ratios, presented quietly.

**Backend.**
- `concentration.py` — pure computation off
  `routes/holdings.py:fetch_holdings()` output. Returns:
  - `top1_pct`, `top3_pct`, `top5_pct` (USD-aggregated)
  - `currency_exposure`: `{ USD: 0.78, SGD: 0.22, ... }` (already
    available in the holdings response, restated here)
  - `single_name_max`: `{ code, pct }` (the most concentrated
    position)
  - `count`: number of held names
- `routes/concentration.py` — `GET /api/concentration` →
  `ConcentrationResponse`.
- `concentration_insight.py` — advisor-pattern Claude block keyed on
  rounded ratios (so identical shapes hit cache). Prompt: "Describe
  the shape of this book in 2 sentences using everyday words. Name
  the most concentrated position. No buy/sell/hold/target/forecast/
  predict/recommend/should language. No copy suggesting rebalancing
  or any action." Cached 6h.

**Frontend.**
- `concentration-block.tsx` — quiet caption row + a horizontal
  stacked-bar SVG (top 5 names + "rest"), under the holdings table.
- [learn more] expands to the Claude commentary (same lazy pattern).
- Currency exposure renders as a second mini-bar (USD / SGD / HKD
  shares).
- No color signaling concentration "high/low". Single ink color,
  hairline rules.

**Out of scope this chunk.** Sector mapping (would need a
ticker→sector source), correlation matrix, beta to benchmark,
drawdown statistics, rebalancing suggestions (forbidden by
framing rule).

**Verification.**
- `curl -s localhost:8000/api/concentration | jq '.top3_pct'` returns
  a 0–1 float matching a manual sum of the top three USD market
  values.
- Currency shares from this endpoint match the hero's per-currency
  caption on the same data.
- Commentary block passes the forbidden-words scan.

---

### D4 — Mobile responsive layout (1 sitting)

**Goal.** Daily-glance mode usable from phone. The current Tailwind
layout is laptop-first; tables overflow horizontally on narrow
viewports, and the hero stacks awkwardly. This chunk adds responsive
breakpoints without redesigning anything.

**Approach.**
- Audit each surface at 375px, 414px, 768px, 1280px. Capture the
  break points in screenshots under `briefs/screenshots/d4-mobile/`.
- Holdings + watchlist tables collapse from a wide table to a
  stacked-card list below `md:` (Tailwind 768px). Each card carries
  ticker / qty / market value (USD) / pnl % + sparkline. Drill-in
  expansion still works.
- Hero: donut moves above the totals on narrow viewports; allocation
  labels stay readable.
- Daily digest, earnings strip, preview block are already mostly
  vertical — verify and tighten padding only.
- Theme toggle stays in the same corner; tap target ≥ 44px.

**Out of scope this chunk.** Native app, push notifications, offline
mode, gesture interactions (swipe-to-expand). Web responsive only.
PWA manifest is a tempting drift — explicitly skip.

**Verification.**
- Real-device pass: open the dashboard on the user's phone over LAN
  (`uv run api --host 0.0.0.0` is required; document that gate in
  the chunk plan). Both daily-glance surfaces (hero + digest) read
  cleanly without horizontal scroll. Drill-ins work via tap.
- Lighthouse mobile score ≥ 90 on the home route after the chunk
  ships (vanity metric, but a useful regression catcher).

---

### D5 — Real-time push (probably-parked)

**Goal (if revisited).** Replace the React Server-Component
`fetch(.., { cache: 'no-store' })` on every navigation with a
push from the FastAPI side, so prices and P&L tick without a page
reload.

**Why this stays parked.**
1. **Timezone gap.** SGT is +12 / +13 vs US market hours. The user
   is rarely awake during US RTH; intra-day push has thin overlap.
2. **Principle #2 — calm under volatility.** PRODUCT.md explicitly
   forbids urgency theater, flashing prices, oversized red P&L. A
   real-time tick stream actively undermines the design posture.
3. **Cheaper alternative exists.** Tightening the existing 30s poll
   to 10s during US RTH inside `/api/holdings` would hit ~95% of
   the perceived-freshness benefit at zero new architecture.
4. **Single-user local app.** No competitive "everyone else has
   real-time" pressure; the only judge is the user's own usage
   pattern.

**Trigger to revisit.** The user opens the dashboard during US RTH
≥ 3 sessions in a quarter, or there's a specific story (earnings
release, FOMC) where 30s-stale data felt actively wrong. Until
then, this stays as the deferred item it has always been.

**If revisited, the smaller version first.** Server-Sent Events
from FastAPI to the React surface, broadcasting only the
holdings + watchlist price deltas. No moomoo subscribe path
yet — the existing 30s poll, just pushed instead of pulled. Saves
the round-trip without committing to a tick-by-tick stream.

## Critical files

Created (across the phase):
- `Coding Projects/investment-dashboard/src/api/notes.py`
- `Coding Projects/investment-dashboard/src/api/data/notes.py`
- `Coding Projects/investment-dashboard/src/api/routes/notes.py`
- `Coding Projects/investment-dashboard/src/api/benchmark.py`
- `Coding Projects/investment-dashboard/src/api/benchmark_insight.py`
- `Coding Projects/investment-dashboard/src/api/routes/benchmark.py`
- `Coding Projects/investment-dashboard/src/api/routes/benchmark_insight.py`
- `Coding Projects/investment-dashboard/src/api/concentration.py`
- `Coding Projects/investment-dashboard/src/api/concentration_insight.py`
- `Coding Projects/investment-dashboard/src/api/routes/concentration.py`
- `Coding Projects/investment-dashboard/web/src/components/notes-block.tsx`
- `Coding Projects/investment-dashboard/web/src/components/benchmark-block.tsx`
- `Coding Projects/investment-dashboard/web/src/components/benchmark-chart.tsx`
- `Coding Projects/investment-dashboard/web/src/components/concentration-block.tsx`

Modified (per chunk):
- `Coding Projects/investment-dashboard/src/api/main.py` — register each new router
- `Coding Projects/investment-dashboard/web/src/app/page.tsx` — slot new sections
- `Coding Projects/investment-dashboard/web/src/components/holdings-table.tsx` — D1 notes-block in drill-in; D4 responsive
- `Coding Projects/investment-dashboard/web/src/components/watchlist-table.tsx` — D1 notes-block in drill-in; D4 responsive
- `Coding Projects/investment-dashboard/web/src/app/globals.css` — D4 breakpoint refinements only if needed
- `Coding Projects/investment-dashboard/CLAUDE.md` — surfaces / route list updated at the end of each chunk

Reused (read-only):
- `src/api/data/prices.py` — `_DB_LOCK` pattern, DuckDB-table caching
- `src/api/digest.py` / `insight.py` / `earnings_insight.py` /
  `preview_insight.py` — advisor-pattern reference for D2 + D3
  Claude blocks (static baseline + lazy fetch + `_PROMPT_VERSION`)
- `src/api/routes/holdings.py:fetch_holdings` — D3 reads its output

## Verification (phase-level success criteria)

After D1 + D2 + D3 + D4 ship (D5 stays parked unless triggered):

1. **Notes survive a server restart.** Type a note, restart `uv run api`,
   reopen the drill-in — note is there.
2. **Benchmark chart renders for 30D / 90D / 1Y windows** with both
   `SPY` (default) and `SPY,SMH` (env override). Commentary block
   passes the forbidden-words scan.
3. **Concentration panel shows top1/3/5 ratios + currency exposure**
   matching manual computation off `/api/holdings`. Commentary block
   passes the forbidden-words scan.
4. **Phone tab loads cleanly** at the user's device width, no
   horizontal scroll, drill-ins reachable, theme toggle still works.
5. **No regressions in Phase C surfaces.** Daily digest, earnings
   strip, tomorrow's preview render and lazy-fetch as before.
6. **CLAUDE.md `## Status` section** is updated at the end of the
   phase to "Phase D shipped (YYYY-MM-DD)" with the new surfaces
   listed in §"Surfaces".

## Open questions parked for chunk plans

These don't block the phase order but should be answered when each
chunk's execution plan is written:

1. **Notes: single-row body or structured fields** (thesis / triggers
   / risks)? Recommend single textarea for D1 — promote to structured
   only if the textarea fills with the same three headings repeatedly.
2. **Benchmark: include moomoo's HK/SG benchmarks** (`HSI`, `STI`)
   when those markets dominate? Defer to chunk plan; default SPY is
   adequate for the current US-heavy book.
3. **Concentration: where exactly does the panel sit** — under the
   holdings table, in the hero, or in a "weekend study" sidebar?
   Defer to chunk plan; expect "under holdings table" wins on
   information-density-without-noise.
4. **Mobile: does the calendar mark on `holdings-table.tsx` need a
   different glyph** at small sizes, or does the SVG icon scale
   cleanly? Audit during D4.
5. **Real-time trigger.** What concrete signal flips D5 from parked
   to active? A usage-pattern check at end of Q2 2026 is one
   option; another is a specific event (earnings on a held name
   while the user is at the laptop) that exposes a 30s-stale gap.

## Out of scope (this phase)

- Auth / multi-user / cloud deploy (never — single-user local app
  by design, restated from `plan/v3-stack-rewrite.md`)
- Order placement, trade unlock, anything that talks to moomoo's
  trade context (the dashboard is a thinking surface, not an
  execution surface — restated from PRODUCT.md)
- Sector mapping / fundamentals / DCF / target prices (forbidden by
  framing rule)
- Push notifications, native app, PWA installable manifest
- Backtesting (lives in the A-股 strategy work in `提示词.txt`,
  not this dashboard)

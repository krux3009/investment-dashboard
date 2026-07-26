# investment-dashboard — Project Context

## Design Context

This project uses [Impeccable](https://impeccable.style) for design fluency. Strategic context lives in [PRODUCT.md](./PRODUCT.md); visual system in [DESIGN.md](./DESIGN.md) and the [DESIGN.json](./DESIGN.json) sidecar. DESIGN.md was first captured 2026-05-05 via `/impeccable document` against the v3 React surface, then re-captured for v4 SWS: Colors + frontmatter 2026-05-19, Typography + Elevation + Components 2026-06-04 (IBM Plex Serif display type, `rounded-xl` shadowless SWS cards, the portfolio tab architecture, and the snowflake / kpi-tile / statement-card / comparison-gauge / dividend-ledger / performance-chart primitives). **`DESIGN.json` still mirrors the v3 component CSS specimens — the one remaining stale design artifact; re-sync is tracked in `plan/v3-phase-e-followups.md`.**

**Quick read:**
- **Register:** product (dashboard, app UI). Design serves the data.
- **Personality:** Quiet · Precise · Considered.
- **North Star:** "The Quiet Ledger" — paper-and-ink ledger for a long-horizon investor.
- **Color:** Restrained — paper cream + warm graphite ink + one rare **SWS gold** accent (≤10% of any screen). A loud status tier (success/warn/danger) is confined to chips + KPI deltas + statement icons, never chart strokes. No `#000`, no `#fff`, no green/red as sole signal.
- **Type:** IBM Plex Sans (working) + Plex Mono (code/tickers) + Plex Serif (display only: portfolio h1, dividend hero, `ƒ` glyph). Tabular figures.
- **Motion:** Restrained — state changes only. Flat by default (v4 SWS cards are bordered + `rounded-xl` but shadowless).
- **Anti-references:** Bloomberg full-clone, crypto-neon, Robinhood gamification, generic LLM SaaS gray-blue.
- **5 principles:** information-first · calm-under-volatility · two-modes-one-vocabulary · long-horizon-not-trading · reasoned-recommendations-you-decide. *(The 5th principle was "signals-not-commands" until 2026-06-06; the owner reversed it — the dashboard now gives direct, grounded recommendations and the user makes the final call. See the `project_recommendation_framing` memory.)*

## Project Overview

Personal investment dashboard sitting on top of moomoo OpenD (the local brokerage gateway). Surfaces portfolio + watchlist + anomaly signals for a single long-horizon investor. Two use modes: 15-second daily glance and 30+ minute weekend study sessions. Trade execution stays in the moomoo native app — this is a thinking surface, not an execution surface.

See [moomoo-opend-setup.md](./moomoo-opend-setup.md) for the data-layer foundation.

## Status: v4 SWS rewrite + full en/zh i18n + portfolio study-tabs shipped (last feature ship 2026-05-27; doc refreshed 2026-06-04)

> **2026-07-27 — advisor UI removed.** The owner runs without an
> `ANTHROPIC_API_KEY` (old key revoked, commented out in `.env`). All
> Claude-prose surfaces were stripped from the frontend: the home
> daily-digest section, per-stock InsightBlock recommendations, every
> [learn more] What/Meaning/Watch expander (foresight, calendar,
> sentiment, concentration), snowflake statement cards, and the
> already-unrendered benchmark-block + dividend-ledger-block. Deleted
> components: `daily-digest` / `insight-block` / `foresight-insight-body`
> / `benchmark-block` / `dividend-ledger-block` / `statement-card`.
> Backend advisor modules + routes stay dormant (503 / `available:false`
> without a key) for a possible future re-enable. Data surfaces
> (tables, charts, scores, Reddit counts, raw anomalies, events) all
> remain. Sections below describing digest/insight prose predate this.

End-to-end on **FastAPI + Next.js + Tailwind 4 + Recharts + Anthropic SDK** with USD home currency. Three top-level routes: `/` home (daily glance), `/portfolio` (weekend study), `/watchlist`. The v4 **Simply-Wall-St-style (SWS) rewrite** made dark the default, swapped the accent to gold, added a status palette + Plex Serif display type, and **split `/portfolio` into six query-param tabs** (`holdings` / `returns` / `updates` / `dividends` / `analysis` / `calendar`) — the snowflake hero, KPI strips, dividend ledger, valuation gauges, returns breakdown, and a month calendar. The whole surface is **fully localized en/zh** (client-only locale, `EN`/`中` toggle; backend advisor prose takes a `?locale=` param). The home digest moved from a single LEAD-line to a per-ticker four-tile analyst grid (Fundamentals/News/Sentiment/Technical). Earlier phases still hold: D5 SSE live ticks (20s during US RTH), Reddit sentiment in drill-ins, the 7/30-day foresight feed (now also surfaced as the portfolio `updates` + `calendar` tabs). Mobile responsive (D4) remains parked at `plan/v3-phase-d.md`.

**Stack:** `uv` + Python 3.14 + FastAPI 0.136 + Pydantic 2.13 + DuckDB
1.5 + yfinance 1.3 + moomoo-api 10.4.6408 + anthropic 0.97 on the
backend; Next.js 16.2 + React 19.2 + Tailwind 4 + IBM Plex Sans /
Mono / Serif + next-themes + Recharts + a hand-rolled client-only
i18n layer (`web/src/lib/i18n/`, `LocaleProvider`) on the frontend.

**Run with two terminals:**

```bash
uv run api                # http://127.0.0.1:8000  (FastAPI, --reload on src/)
cd web && npm run dev     # http://localhost:3000
```

`.env` carries the moomoo connection params (TRD_ENV, MARKETS,
SECURITY_FIRM, optional WATCHLIST) and `ANTHROPIC_API_KEY` for the
advisor surfaces. Default home currency = USD; non-USD positions get
FX-converted via yfinance, in-memory cached with a 1h TTL.

## Surfaces

Three routes, layered for the two reading modes from PRODUCT.md.

### `/` home (15-second daily glance)

1. **Hero.** USD-aggregated total + signed P&L + per-currency
   breakdown caption + FX rates used. Allocation donut on the right
   with labels-on-slices.
2. **Daily digest.** Always-on (no toggle) — auto-fetches on mount.
   A per-ticker **four-tile analyst grid** (Fundamentals · News ·
   Sentiment · Technical), one Claude call per tile, server-cached
   6h in `digest_tiles_cache`. No top-level `prose` field anymore
   (the v4 digest response is `{generated_at, cached, holdings:[…]}`
   with per-holding tile fields). Footer hint points to per-stock
   drill-ins on `/portfolio`.
3. **Foresight (7/30 days).** Chronological timeline of upcoming
   events combining three sources: per-holding earnings dates +
   macro releases (FOMC/CPI/NFP/PPI from a static JSON) +
   Claude-curated company events (product launches, investor days,
   conference talks, pre-announced earnings calls). Default 7-day
   window with toggle to 30D. Per-event [learn more] expands a
   Claude What/Meaning/Watch trio cached 6h. Replaced the prior
   tomorrow's-preview block (retired).

### `/portfolio` (weekend study)

Six tabs selected by the `?tab=` query param (parsed server-side in
`app/portfolio/page.tsx`, default `holdings`, `?tab=table` aliases to
`holdings`). The tab strip is `portfolio-tab-nav.tsx` (gold active
underline). Each tab SSRs its own content.

1. **`holdings`** (default). Leads with a two-column hero: a
   `performance-chart-card` (portfolio cumulative %Δ vs SPY —
   `MOOMOO_BENCHMARKS` env-overridable — over a range strip, hand-
   rolled SVG `benchmark-chart`) beside a `portfolio-snowflake-card`
   (5-axis SWS snowflake). Then a `holdings-kpi-strip`
   (unrealized / realized / dividends / currency) and the **register
   table**: sortable headers (localStorage), 30-day sparklines, a
   mini snowflake + calendar/ƒ glyph column, click-to-expand drill-in
   (90-day Recharts price chart, per-stock Meaning + Watch, debounced
   notes, Reddit · past 7 days, plain-English Technical + Capital-flow
   anomaly prose). Concentration shape lives under the `analysis` tab
   now.
2. **`returns`.** Breakdown stacked bar (unrealized + realized +
   dividends + currency) over a five-tile KPI grid, highest/lowest-5
   contributors, a scrollable 13-column detail table with CSV export.
3. **`updates`.** The foresight feed (per-holding earnings + macro
   releases + Claude-curated company events) with per-event [learn
   more] What/Meaning/Watch.
4. **`dividends`.** Income hero (serif 12m forecast total + YoY) +
   16-month history bars + largest/smallest contributors + quality
   buckets + a 12m/24m/36m forecast switcher.
5. **`analysis`.** Five client-state sub-tabs (the snowflake axes:
   Valuation / Future / Past / Health / Dividend; only Valuation is
   live — fair-value card + PE/PS/PEG comparison gauges) plus the
   diversification block (sector / geography / top-10 stacked bars).
6. **`calendar`.** A `grid-cols-7` month grid (`?month=YYYY-MM`) with
   daily P&L + event chips (earnings / macro / ex-div / company); a
   selected event opens a lazy foresight What/Meaning/Watch panel.

### `/watchlist`

Same drill-in pattern as holdings (notes included). Codes resolved
from MOOMOO_WATCHLIST env > `get_user_security('All')` > hardcoded
fallback.

Theme is a 2-state `dark ↔ light` swap via next-themes since v4
(`defaultTheme="dark"`, `enableSystem={false}`; the v3 3-state cycle
was retired). A `locale-toggle` (`EN`/`中`) sits beside it in the nav.
v4 SWS tokens (warm cream light / cool near-black dark, gold accent,
status palette) defined as CSS variables in `web/src/app/globals.css`,
paired for both modes.

### Live tick stream (D5)

Every route gets a single SSE connection to `/api/stream/prices`
mounted via `<LivePricesProvider>` in `web/src/app/layout.tsx`.
During US Regular Trading Hours the broadcaster pushes one `tick`
event every 20s — full holdings + watchlist payload — plus a
`market_status` event on RTH transitions and SSE keepalive
comments every 15s. Outside RTH no moomoo calls happen; the
connection stays open with keepalives only.

The frontend `live-store.ts` (dep-free `useSyncExternalStore`)
exposes `useLiveTotals`, `useLiveHoldingsMap`,
`useLiveWatchlistMap`, `useLiveMarket`, `useLiveConnected`. Hero
plus the holdings + watchlist tables overlay live values onto
their SSR initial. Cells that change get a 600ms `tick-pulse-cell`
animation that fades a desaturated `--accent-tint` back to
transparent — no green/red flash, no row shift, principle-#2
calm-under-volatility holds. `prefers-reduced-motion` disables
the animation; values still swap silently.

A footer `<LiveIndicator />` shows the stream state on every
route: `Live · last tick HH:MM:SS SGT` during RTH,
`Market closed · next open …` outside, `Connecting…` /
`Reconnecting…` during transport hiccups.

The realtime broadcaster is one asyncio task started in the
FastAPI lifespan; per-client `asyncio.Queue` fan-out so N
browser tabs cost a single moomoo snapshot per tick. NYSE
holiday list lives in `src/api/market_hours.py` (2026-2027
hardcoded; bump annually or swap to `pandas_market_calendars`
for a longer horizon).

## Advisor pattern

Surfaces that include Claude-generated commentary share a common
shape: the digest tiles (via `analysts/{fundamentals,news,sentiment,
technical}.py` over `analysts/_base.py`), per-stock insight, benchmark
commentary, concentration commentary, dividends commentary, the
snowflake per-axis statements, foresight per-event, plus the
company-events fetcher that feeds foresight.

- **Static plain-English baseline** — every surface is useful even
  without an Anthropic key. Tables, charts, ratios, and event
  timelines render with handwritten labels and plain phrasing.
- **Optional Claude depth** — [learn more] / drill-in toggles fetch
  the commentary lazily. The per-stock drill-in (`/api/insight/{code}`)
  now returns a structured **recommendation** (`Action / Why /
  Confidence / Risk`, cached in `recommendation_cache`); the other
  surfaces keep their `What / Meaning / Watch` shape but the prose is
  now directional. Endpoints are paired
  (`/api/digest`, `/api/insight/{code}`, `/api/benchmark-insight`,
  `/api/concentration-insight`, `/api/dividends-insight`,
  `/api/sentiment-insight/{code}`, `/api/foresight-insight/{event_id}`,
  `/api/snowflake`) and each caches in DuckDB keyed on
  `(dimension, prompt_version_with_locale(_PROMPT_VERSION, locale))`
  so a prompt edit **or** a locale switch invalidates cleanly. Current
  prompt versions (all bumped 2026-06-06 for the recommendation rework):
  digest `v7-recommend`, insight `v6-recommend`, benchmark /
  concentration / foresight `v5-recommend`, sentiment `v3-recommend`,
  dividends `v2-recommend`, snowflake `v4-recommend`, anomaly-translator
  `v4-recommend`, company-events `v1` (unchanged). Locale resolved via
  `api.i18n.parse_locale`; advisor prose accepts `?locale=en|zh`.
  When editing any prompt copy / ban list / schema, bump its
  `_PROMPT_VERSION` (use `/prompt-bump`).
- **Recommendation framing (since 2026-06-06)** — the educational-only
  guardrail was removed. Prompts may now use action language (buy /
  sell / hold / trim / add / target / rebalance / diversify /
  outperform / cheap / expensive, etc.) and give a direct, actionable
  view. The reader makes the final decision. The **only** surviving
  post-check is a slim anti-hype list (`_advisor_guard.FORBIDDEN_HYPE`:
  guaranteed / to the moon / can't lose / 稳赚 / 必涨, etc.) so prose
  stays calm and grounded — no pump, no guarantees, no certainty
  claims. The per-stock recommendation must stay grounded in the
  signals passed and always carry Confidence + Risk (that pair is the
  safety net; there is no disclaimer). See the
  `project_recommendation_framing` memory.

## Architecture

Retired since the v3 doc: `earnings_insight.py`, `preview.py`,
`preview_insight.py` (the tomorrow's-preview block + per-report
earnings depth folded into the unified foresight surface).

```
src/api/
├── main.py                  ← FastAPI app + uvicorn cli + lifespan (broadcaster)
├── models.py                ← Pydantic Holding / HoldingsResponse
├── i18n.py                  ← parse_locale + prompt_version_with_locale (en/zh)
├── _advisor_guard.py        ← shared FORBIDDEN framing guard for advisor prose
├── fx.py                    ← yfinance + 1h in-process cache
├── holdings_payload.py      ← shared USD-aggregation builder (REST + SSE)
├── market_hours.py          ← is_us_rth / next_open + NYSE holiday list (D5)
├── realtime.py              ← SSE Broadcaster (20s tick during RTH) (D5)
│   ── advisor prose (Claude; each defines _PROMPT_VERSION) ──
├── digest.py                ← per-ticker 4-tile analyst grid orchestrator
├── analysts/                ← one tile each: _base + fundamentals/news/sentiment/technical
├── insight.py               ← per-stock Meaning + Watch
├── anomaly_translator.py    ← moomoo prose → plain English
├── benchmark_insight.py     ← portfolio-vs-benchmark commentary
├── concentration_insight.py ← concentration-shape commentary
├── dividends_insight.py     ← dividend commentary
├── sentiment_insight.py     ← Reddit per-stock What/Meaning/Watch
├── foresight_insight.py     ← per-event What/Meaning/Watch
├── company_events.py        ← Claude-curated company events (feeds foresight)
│   ── data prep (no Claude) ──
├── earnings.py              ← yfinance Ticker.calendar per holding
├── foresight.py             ← merges earnings + macro_events + company_events
├── macro_events.py          ← static FOMC/CPI/NFP/PPI release calendar
├── benchmark.py             ← cumulative %Δ vs SPY series
├── concentration.py         ← top-N share + currency exposure
├── dividends.py             ← dividend ledger; dividends_extended.py ← forecast/quality
├── returns.py               ← realized/unrealized/dividend/currency breakdown
├── portfolio_metrics.py     ← shared portfolio math
├── daily_pnl.py             ← per-day P&L history (calendar tab)
├── snowflake.py             ← 5-axis SWS scores + per-axis statements
├── fair_value.py            ← valuation (PE/PS/PEG, fair-value gauges)
├── reddit_sentiment.py      ← praw + VADER + aggregator
├── data/                    ← live moomoo data layer
│   ├── positions.py         ← Position dataclass + formatters
│   ├── moomoo_client.py     ← OpenSecTradeContext wrapper, dedupe-by-code
│   ├── prices.py            ← DuckDB-cached daily bars (data/prices.duckdb)
│   ├── quotes.py            ← snapshot quotes
│   ├── anomalies.py         ← OpenQuoteContext.get_*_unusual + fetch_all_plain
│   ├── notes.py             ← DuckDB-backed position notes store
│   └── reddit_cache.py      ← DuckDB-cached Reddit mentions (24h TTL)
└── routes/                  ← thin FastAPI routers, all under /api
    ├── holdings · prices · quotes · anomalies · watchlist · notes · stream
    ├── digest · insight · benchmark(+_insight) · concentration(+_insight)
    ├── dividends(+_insight) · sentiment_insight · foresight(+_insight)
    ├── earnings · daily_pnl · returns · portfolio · valuation · snowflake
    └── reddit

web/
├── src/app/             ← App Router; /portfolio/page.tsx fans the ?tab= router
├── src/components/      ← ~50 components. Clusters:
│     glance: Hero, Donut, DailyDigest, Sparkline, ForesightBlock
│     register: HoldingsTable, WatchlistTable, DrillIn, PriceChart,
│               InsightBlock, AnomalyBlock, SentimentBlock, NotesBlock
│     SWS portfolio: PortfolioTabNav, PerformanceChartCard, Snowflake(+Card/
│               Statements), StatementCard, KpiTile/Strip, ComparisonGauge,
│               AnalysisView(+SubTabs), DividendsView, DividendLedgerBlock,
│               ReturnsView, CalendarView, ConcentrationBlock, BenchmarkChart
│     chrome: NavBar, ThemeToggle, LocaleToggle, ThemeProvider, LiveIndicator,
│               LivePricesProvider
└── src/lib/             ← api client, utils (cn), formatters,
      live-store + use-live-prices + use-tick-pulse (D5), i18n/ (LocaleProvider,
      strings, use-t)
```

## Conventions to remember

- **Charts that ship in SSR HTML are hand-rolled SVG.** Sparklines,
  donut, concentration/currency/dividend stacked bars, the benchmark
  line, and the 5-axis snowflake are all SVG paths computed at render
  time. `price-chart.tsx` (the drill-in 90-day chart) is the **only**
  Recharts surface; the v4 `performance-chart-card` embeds the hand-
  rolled `benchmark-chart`, not Recharts. Recharts' ResponsiveContainer
  doesn't measure cleanly during SSR and emits "-1 dimension" warnings;
  we sidestep that everywhere it matters for first paint.
- **i18n is client-only.** No locale cookie; `LocaleProvider`'s storage
  key is `dashboard-locale` (not `locale`). A server tab that needs
  translated content does a server-fetch + a `"use client"` view;
  backend advisor prose translates via `?locale=`. See the
  `project_i18n_architecture` memory.
- **`prices.duckdb` is single-writer.** Only the FastAPI process
  writes to it. (v2's parallel-writer arrangement was retired with
  Dash; see commit history if you need archaeology.)
- **dotenv must load at module import, not inside `cli()`.** uvicorn's
  `--reload` re-imports `api.main:app` in a child process; loading
  dotenv only in the parent leaves the child seeing default
  `MOOMOO_TRD_ENV=SIMULATE` and returning an empty book.
- **Next.js 16 has breaking changes.** Read
  `web/node_modules/next/dist/docs/` before writing Next code; the
  scaffold's `web/AGENTS.md` flags this explicitly. `fetch` is
  no-cache by default in 16, so `cache: 'no-store'` is harmless but
  redundant.
- **Plans live in [plan/](./plan/).** Active and historical plans go
  there — never `~/.claude/plans/`, never the repo root.
- **End every session with a recap in [sessions/](./sessions/).** When
  the user signals close ("ending today", "wrapping up", "done for
  today", "good night", "that's it for the day", etc.), write
  `sessions/YYYY-MM-DD.md` before the session ends. Layout: frontmatter
  (date, window, commits, range, theme) → Context → Shipped (grouped
  by theme) → Ship state → Improvements for next session → Sharp
  gotchas. Match `sessions/2026-05-04-phase-d-foresight.md`. ~50–120
  lines. `sessions/` is gitignored — local-only, do not stage. One
  file per calendar day; append if a second stretch happens same day.

## Verification

Advisor-prose endpoints time out at the holdings fetch unless **OpenD
`:11111` is running**. `?locale=zh&refresh=true` forces a fresh zh
generation past the cache.

- `curl -s localhost:8000/api/health` → `{"status":"ok"}`
- `curl -s localhost:8000/api/holdings | jq '.holdings | length'` → 5
- `curl -s localhost:8000/api/digest | jq '.holdings[0] | {fundamentals,news,sentiment,technical}'`
  → the four analyst-tile fields (no top-level `.prose`). Add
  `?locale=zh&refresh=true` and they return Chinese.
- `curl -s localhost:8000/api/snowflake/portfolio | jq '.scores'` →
  the 5-axis SWS scores (`/api/snowflake/{code}` for one holding).
- `curl -s localhost:8000/api/returns/summary | jq` → realized /
  unrealized / dividends / currency breakdown (`/detail`,
  `/contributors` are siblings).
- `curl -s localhost:8000/api/dividends | jq 'keys'` → dividend ledger
  (`/dividends/forecast?horizon=`, `/dividends/quality-buckets` siblings).
- `curl -s localhost:8000/api/foresight | jq '.events | length'` →
  upcoming earnings + macro + company events (may be 0 on a quiet
  horizon — verify a per-event `/api/foresight-insight/{id}` is alive
  before assuming the surface is healthy).
- `curl -sN localhost:8000/api/stream/prices` opens an SSE stream:
  one `event: tick` every 20s during US RTH, otherwise SSE
  keepalive comments every 15s; emits `event: market_status` on
  RTH transitions.
- `curl -s localhost:8000/api/reddit/US.NVDA | jq '.total_mentions'` →
  non-negative integer when Reddit creds present; 503 with
  `"Reddit not configured…"` when missing. See `reddit-setup.md`.
- `localhost:3000` renders hero + 4-tile digest + foresight + holdings
  (calendar/ƒ marks) + watchlist; `/portfolio` tabs (holdings / returns /
  updates / dividends / analysis / calendar) all SSR; sort + expand work;
  the `EN`/`中` + dark/light toggles flip cleanly. Footer LiveIndicator
  shows `Live · last tick HH:MM:SS SGT` during RTH and
  `Market closed · next open …` outside.

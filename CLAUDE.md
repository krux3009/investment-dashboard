# investment-dashboard — Project Context

## Design Context

This project uses [Impeccable](https://impeccable.style) for design fluency. Strategic context lives in [PRODUCT.md](./PRODUCT.md); visual system in [DESIGN.md](./DESIGN.md) and [DESIGN.json](./DESIGN.json) sidecar (captured 2026-05-05 via `/impeccable document` against the v3 React surface — frontmatter tokens, six-section body, hand-rolled-SVG + label-cap rules, dark/light parity tables, drill-in / textarea / nav-tab component primitives).

**Quick read:**
- **Register:** product (dashboard, app UI). Design serves the data.
- **Personality:** Quiet · Precise · Considered.
- **North Star:** "The Quiet Ledger" — paper-and-ink ledger for a long-horizon investor.
- **Color:** Restrained — paper cream + warm graphite ink + one rare accent (≤10% of any screen). No `#000`, no `#fff`, no green/red as sole signal.
- **Type:** IBM Plex Sans + Plex Mono. Tabular figures.
- **Motion:** Restrained — state changes only. Flat by default.
- **Anti-references:** Bloomberg full-clone, crypto-neon, Robinhood gamification, generic LLM SaaS gray-blue.
- **5 principles:** information-first · calm-under-volatility · two-modes-one-vocabulary · long-horizon-not-trading · signals-not-commands.

## Project Overview

Personal investment dashboard sitting on top of moomoo OpenD (the local brokerage gateway). Surfaces portfolio + watchlist + anomaly signals for a single long-horizon investor. Two use modes: 15-second daily glance and 30+ minute weekend study sessions. Trade execution stays in the moomoo native app — this is a thinking surface, not an execution surface.

See [moomoo-opend-setup.md](./moomoo-opend-setup.md) for the data-layer foundation.

## Status: Phase D + foresight + D5 SSE shipped (2026-05-06)

End-to-end on **FastAPI + Next.js + Tailwind 4 + Recharts + Anthropic SDK** with USD home currency. Three routes: `/` home (daily glance), `/portfolio` (weekend study), `/watchlist`. Phase D D1+D2+D3 layered position notes, portfolio-vs-benchmark performance, and concentration shape; D5 (2026-05-06) added a Server-Sent-Events live-tick stream so hero / holdings / watchlist update silently every 20s during US RTH without a page reload. The home page's tomorrow's-preview block was retired in favour of a 7/30-day foresight section combining earnings + macro releases (FOMC/CPI/NFP/PPI) + Claude-curated company events. Mobile responsive (D4) remains parked at `plan/v3-phase-d.md` (deferred 2026-05-06).

**Stack:** `uv` + Python 3.14 + FastAPI 0.136 + Pydantic 2.13 + DuckDB
1.5 + yfinance 1.3 + moomoo-api 10.4.6408 + anthropic 0.97 on the
backend; Next.js 16.2 + React 19.2 + Tailwind 4 + IBM Plex Sans +
next-themes + Recharts on the frontend.

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
   LEAD line + per-ticker one-sentence summaries in plain English.
   Server-cached 6h. Footer hint points to per-stock drill-ins on
   `/portfolio`.
3. **Foresight (7/30 days).** Chronological timeline of upcoming
   events combining three sources: per-holding earnings dates +
   macro releases (FOMC/CPI/NFP/PPI from a static JSON) +
   Claude-curated company events (product launches, investor days,
   conference talks, pre-announced earnings calls). Default 7-day
   window with toggle to 30D. Per-event [learn more] expands a
   Claude What/Meaning/Watch trio cached 6h. Replaced the prior
   tomorrow's-preview block (retired).

### `/portfolio` (weekend study)

1. **Portfolio vs benchmark.** Hand-rolled SVG line chart comparing
   portfolio's cumulative %Δ against SPY (default,
   `MOOMOO_BENCHMARKS` env-overridable) over 30D / 90D / 1Y windows.
   Tabular legend below; [learn more] expands a Claude commentary.
   Caveat caption: path uses current weights projected backward.
2. **Holdings table.** Sortable column headers (localStorage-
   persisted), 30-day SVG sparklines, calendar mark next to tickers
   reporting in ≤14 days, click-to-expand drill-in. Drill-in shows:
   90-day price chart, "What this means" (per-stock Meaning + Watch),
   freeform position notes (debounced auto-save to DuckDB), then
   plain-English Technical + Capital-flow anomaly prose. The
   earnings-strip section was retired — its [learn more] depth
   moved into the unified foresight insight on home.
3. **Concentration shape.** Top-1/3/5 USD share + holdings count,
   stacked-bar SVG by descending position weight, currency exposure
   stacked bar, single-name max line. [learn more] toggle expands
   a Claude What/Meaning/Watch trio. Observational only — no
   thresholds, no rebalance language.

### `/watchlist`

Same drill-in pattern as holdings (notes included). Codes resolved
from MOOMOO_WATCHLIST env > `get_user_security('All')` > hardcoded
fallback.

Theme cycles `system → light → dark → system` via next-themes.
warm-graphite tokens defined as CSS variables in `web/src/app/globals.css`,
mirroring the v2 oklch palette in both modes.

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
shape: digest, per-stock insight, benchmark commentary, concentration
commentary, foresight per-event, plus the company-events fetcher
that feeds foresight.

- **Static plain-English baseline** — every surface is useful even
  without an Anthropic key. Tables, charts, ratios, and event
  timelines render with handwritten labels and plain phrasing.
- **Optional Claude depth** — [learn more] / drill-in toggles fetch
  a `What / Meaning / Watch` block lazily. Endpoints are paired
  (`/api/digest`, `/api/insight/{code}`, `/api/benchmark-insight`,
  `/api/concentration-insight`, `/api/foresight-insight/{event_id}`)
  and each caches in DuckDB keyed on `(dimension, _PROMPT_VERSION)`
  so prompt edits invalidate cleanly.
- **Educational framing only** — every prompt forbids buy / sell /
  hold / trim / add / target / forecast / predict / expect /
  recommend / "you should" / rally / surge / soar / crash / etc.
  Surface-specific bans extend the list (concentration forbids
  rebalance/diversify/over-weight/under-weight; benchmark forbids
  alpha/beta/outperform; foresight forbids predicting outcomes).
  Every "Watch" line names an observation target, never an action.
  See `~/.claude/projects/-Users-tanlixuan-Me-Vault/memory/feedback_financial_framing.md`.

## Architecture

```
src/api/
├── main.py                  ← FastAPI app + uvicorn cli + lifespan (broadcaster)
├── models.py                ← Pydantic Holding / HoldingsResponse
├── fx.py                    ← yfinance + 1h in-process cache
├── holdings_payload.py      ← shared USD-aggregation builder (REST + SSE)
├── market_hours.py          ← is_us_rth / next_open + NYSE holiday list (D5)
├── realtime.py              ← SSE Broadcaster (20s tick during RTH) (D5)
├── digest.py                ← daily LEAD + ticker summaries (Phase C.1)
├── insight.py               ← per-stock Meaning + Watch (Phase C.1)
├── anomaly_translator.py    ← moomoo prose → plain English (Phase C.1)
├── earnings.py              ← yfinance Ticker.calendar per holding (C.2)
├── earnings_insight.py      ← per-report What / Meaning / Watch (C.2)
├── preview.py               ← futures + Asia close fetcher (C.3)
├── preview_insight.py       ← per-symbol What / Meaning / Watch (C.3)
├── data/                    ← live moomoo data layer
│   ├── positions.py         ← Position dataclass + formatters
│   ├── moomoo_client.py     ← OpenSecTradeContext wrapper, dedupe-by-code
│   ├── prices.py            ← DuckDB-cached daily bars (data/prices.duckdb)
│   └── anomalies.py         ← OpenQuoteContext.get_*_unusual + fetch_all_plain
└── routes/
    ├── holdings.py          ← /api/holdings        (USD-aggregated)
    ├── prices.py            ← /api/prices/{code}   (N-day close series)
    ├── anomalies.py         ← /api/anomalies/{code} (plain-English)
    ├── watchlist.py         ← /api/watchlist       (env > moomoo > default)
    ├── digest.py            ← /api/digest
    ├── insight.py           ← /api/insight/{code}
    ├── earnings.py          ← /api/earnings
    ├── earnings_insight.py  ← /api/earnings-insight/{code}
    ├── preview.py           ← /api/preview
    ├── preview_insight.py   ← /api/preview-insight/{symbol}
    └── stream.py            ← /api/stream/prices (SSE live ticks) (D5)

web/
├── src/app/             ← Next.js App Router
├── src/components/      ← Hero, HoldingsTable, WatchlistTable, Donut,
│                          Sparkline, PriceChart, DrillIn, AnomalyBlock,
│                          ThemeProvider, ThemeToggle, DailyDigest,
│                          InsightBlock, EarningsStrip, PreviewBlock,
│                          LivePricesProvider, LiveIndicator (D5)
└── src/lib/             ← api client, utils (cn), formatters,
                           live-store + use-live-prices + use-tick-pulse (D5)
```

## Conventions to remember

- **Charts that ship in SSR HTML are hand-rolled SVG.** Sparklines and
  the donut are SVG paths computed at render time. Recharts is used
  only inside lazy-rendered drill-ins (PriceChart) where SSR isn't a
  concern. Recharts' ResponsiveContainer doesn't measure cleanly during
  SSR and emits "-1 dimension" warnings; we sidestep that everywhere
  it matters for first paint.
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

- `curl -s localhost:8000/api/health` → `{"status":"ok"}`
- `curl -s localhost:8000/api/holdings | jq '.holdings | length'` → 5
- `curl -s localhost:8000/api/digest | jq -r .prose` → LEAD + per-ticker
  summaries in plain English (no jargon, no action verbs).
- `curl -s localhost:8000/api/earnings | jq '.items | length'` →
  upcoming reports for held positions (4 today; K71U has past data).
- `curl -s localhost:8000/api/preview | jq` → futures + Asia close
  rows with `in_window` flag.
- `curl -sN localhost:8000/api/stream/prices` opens an SSE stream:
  one `event: tick` every 20s during US RTH, otherwise SSE
  keepalive comments every 15s; emits `event: market_status` on
  RTH transitions.
- `localhost:3000` renders hero + digest + earnings strip + holdings
  (with calendar marks) + watchlist + tomorrow's preview; sort +
  expand work; theme toggle cycles cleanly. Footer LiveIndicator
  shows `Live · last tick HH:MM:SS SGT` during RTH and
  `Market closed · next open …` outside.

# investment-dashboard — Project Context

## Design Context

This project uses [Impeccable](https://impeccable.style) for design fluency. Strategic context lives in [PRODUCT.md](./PRODUCT.md); visual system in [DESIGN.md](./DESIGN.md) (currently a `<!-- SEED -->` — re-run `/impeccable document` once the v3 React surface stabilises to capture actual tokens).

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

## Status: v3 shipped (2026-05-03)

End-to-end on **FastAPI + Next.js + Tailwind 4 + Recharts** with USD home currency. Replaced the v2 Dash app, which was retired in chunk 3 of Phase B.

**Stack:** `uv` + Python 3.14 + FastAPI 0.136 + Pydantic 2.13 + DuckDB
1.5 + yfinance 1.3 + moomoo-api 10.4.6408 on the backend; Next.js
16.2 + React 19.2 + Tailwind 4 + IBM Plex Sans + next-themes +
Recharts on the frontend.

**Run with two terminals:**

```bash
uv run api                # http://127.0.0.1:8000  (FastAPI, --reload on src/)
cd web && npm run dev     # http://localhost:3000
```

`.env` carries the moomoo connection params (TRD_ENV, MARKETS,
SECURITY_FIRM, optional WATCHLIST). Default home currency = USD;
non-USD positions get FX-converted via yfinance, in-memory cached
with a 1h TTL.

## v3 surface (one page, three sections)

1. **Hero.** USD-aggregated total + signed P&L + per-currency
   breakdown caption + FX rates used. Allocation donut on the right
   with labels-on-slices (no hover-only). Fixes v2 papercuts.
2. **Holdings table.** Sortable column headers (localStorage-persisted),
   30-day SVG sparklines, click-to-expand drill-in: 90-day price chart
   on the left, technical + capital-flow anomaly prose on the right
   (lazy-fetched on first expand, cached per symbol).
3. **Watchlist.** Codes resolved from MOOMOO_WATCHLIST env >
   `get_user_security('All')` > hardcoded fallback. Same expand-to-
   drill-in pattern as holdings.

Theme cycles `system → light → dark → system` via next-themes.
warm-graphite tokens defined as CSS variables in `web/src/app/globals.css`,
mirroring the v2 oklch palette in both modes.

## Architecture

```
src/api/
├── main.py              ← FastAPI app + uvicorn cli
├── models.py            ← Pydantic Holding / HoldingsResponse
├── fx.py                ← yfinance + 1h in-process cache
├── data/                ← live moomoo data layer (was src/dashboard/data)
│   ├── positions.py     ← Position dataclass + formatters
│   ├── moomoo_client.py ← OpenSecTradeContext wrapper, dedupe-by-code
│   ├── prices.py        ← DuckDB-cached daily bars (data/prices.duckdb)
│   └── anomalies.py     ← OpenQuoteContext.get_*_unusual wrappers
└── routes/
    ├── holdings.py      ← /api/holdings        (USD-aggregated)
    ├── prices.py        ← /api/prices/{code}   (N-day close series)
    ├── anomalies.py     ← /api/anomalies/{code}
    └── watchlist.py     ← /api/watchlist       (env > moomoo > default)

web/
├── src/app/             ← Next.js App Router
├── src/components/      ← Hero, HoldingsTable, WatchlistTable, Donut,
│                          Sparkline, PriceChart, DrillIn,
│                          AnomalyBlock, ThemeProvider, ThemeToggle
└── src/lib/             ← api client, utils (cn), formatters
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

## Verification

- `curl -s localhost:8000/api/health` → `{"status":"ok"}`
- `curl -s localhost:8000/api/holdings | jq '.holdings | length'` → 5
- `localhost:3000` renders hero + donut + holdings + watchlist with
  every position USD-converted; sort + expand work; theme toggle
  cycles cleanly.

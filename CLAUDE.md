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

## Status: Phase D D1+D2+D3 shipped (2026-05-04)

End-to-end on **FastAPI + Next.js + Tailwind 4 + Recharts + Anthropic SDK** with USD home currency. Phase C added the three advisor surfaces (digest, earnings, preview); Phase D D1+D2+D3 layered position notes, portfolio-vs-benchmark performance, and concentration shape. Mobile responsive (D4) and real-time push (D5) remain parked at `plan/v3-phase-d.md`.

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

## Surfaces (one page, top-to-bottom)

1. **Hero.** USD-aggregated total + signed P&L + per-currency
   breakdown caption + FX rates used. Allocation donut on the right
   with labels-on-slices.
2. **Portfolio vs benchmark (D2).** Hand-rolled SVG line chart
   comparing the portfolio's cumulative %Δ against SPY (default,
   `MOOMOO_BENCHMARKS` env-overridable) over 30D / 90D / 1Y windows.
   Tabular legend below; [learn more] expands a Claude-generated
   What/Meaning/Watch comparison. Caveat caption notes that the
   path uses current weights projected backward.
3. **Daily digest.** Collapsed by default. LEAD line + per-ticker
   one-sentence summaries in plain English. Lazy-fetched on first
   expand, server-cached 6h. Footer hint points the reader to per-
   stock drill-ins for deeper teaching.
4. **Upcoming earnings strip.** Static plain-English list of next-
   report dates per holding with inline analyst-estimate sentence.
   Each row has a [learn more] toggle that lazy-fetches a Claude-
   generated What/Meaning/Watch block specific to that report.
5. **Holdings table.** Sortable column headers (localStorage-persisted),
   30-day SVG sparklines, calendar mark next to tickers reporting
   in ≤14 days, click-to-expand drill-in. Drill-in shows: 90-day
   price chart, "What this means" (per-stock Meaning + Watch),
   freeform position notes (D1, debounced auto-save to DuckDB),
   then plain-English Technical + Capital-flow anomaly prose
   (lazy-fetched, server-cached per symbol).
6. **Concentration shape (D3).** Top-1/3/5 USD share + holdings
   count, stacked-bar SVG by descending position weight, currency
   exposure stacked bar, single-name max line. [learn more] toggle
   expands a Claude-generated What/Meaning/Watch trio. Observational
   only — no thresholds, no rebalance language. Sits between the
   holdings table and the watchlist.
7. **Watchlist.** Codes resolved from MOOMOO_WATCHLIST env >
   `get_user_security('All')` > hardcoded fallback. Same drill-in
   pattern as holdings (notes included).
8. **Tomorrow's preview.** Footer block — US futures (ES=F, NQ=F) +
   Asia closes (^N225, ^HSI). Always renders; dims outside the SGT
   pre-market window (17:00–22:00). Per-row [learn more] toggle
   lazy-fetches a Claude block, server-cached 1h.

Theme cycles `system → light → dark → system` via next-themes.
warm-graphite tokens defined as CSS variables in `web/src/app/globals.css`,
mirroring the v2 oklch palette in both modes.

## Phase C — advisor pattern (digest + earnings + preview)

All three advisor surfaces share the same pattern:

- **Static plain-English baseline** — the surface is useful even
  without an Anthropic key. Strip + digest summaries + preview rows
  render with handwritten labels and inline phrasing in everyday
  words (no EPS / RSI / MA / death-cross / futures jargon).
- **Optional Claude depth** — every entry has a [learn more] / drill-
  in affordance that fetches a `What / Meaning / Watch` block, lazily.
  Endpoints are paired (`/api/digest`, `/api/insight/{code}`,
  `/api/earnings-insight/{code}`, `/api/preview-insight/{symbol}`)
  and each caches in DuckDB with a `_PROMPT_VERSION` field so prompt
  edits invalidate cleanly.
- **Educational framing only** — every prompt forbids buy / sell /
  hold / target / forecast / predict / recommend / "you should",
  every prompt translates technical concepts to everyday meaning, and
  every "Watch" line names an observation target instead of an
  action. See `~/.claude/projects/-Users-tanlixuan-Me-Vault/memory/feedback_financial_framing.md`.

## Architecture

```
src/api/
├── main.py                  ← FastAPI app + uvicorn cli
├── models.py                ← Pydantic Holding / HoldingsResponse
├── fx.py                    ← yfinance + 1h in-process cache
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
    └── preview_insight.py   ← /api/preview-insight/{symbol}

web/
├── src/app/             ← Next.js App Router
├── src/components/      ← Hero, HoldingsTable, WatchlistTable, Donut,
│                          Sparkline, PriceChart, DrillIn, AnomalyBlock,
│                          ThemeProvider, ThemeToggle, DailyDigest,
│                          InsightBlock, EarningsStrip, PreviewBlock
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
- `curl -s localhost:8000/api/digest | jq -r .prose` → LEAD + per-ticker
  summaries in plain English (no jargon, no action verbs).
- `curl -s localhost:8000/api/earnings | jq '.items | length'` →
  upcoming reports for held positions (4 today; K71U has past data).
- `curl -s localhost:8000/api/preview | jq` → futures + Asia close
  rows with `in_window` flag.
- `localhost:3000` renders hero + digest + earnings strip + holdings
  (with calendar marks) + watchlist + tomorrow's preview; sort +
  expand work; theme toggle cycles cleanly.

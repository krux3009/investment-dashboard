# Continue investment-dashboard — Phase A execution

## Context

The dashboard's strategic roadmap was locked on 2026-05-02 night in
[`Coding Projects/investment-dashboard/plan/v3-stack-rewrite.md`](../../../Me%20Vault/Coding%20Projects/investment-dashboard/plan/v3-stack-rewrite.md).
v2 (Dash + Plotly + DuckDB + watchlist drill-in + lazy-load anomalies)
ships at 11 commits past v1 and exposed four limits Dash can't fix
cheaply: residual lag, low visual ceiling, the confusing mixed-currency
hero, and labels-on-hover-only donut. Decision was a stack rewrite to
**FastAPI + Next.js + Tailwind + shadcn/ui + Recharts** with USD as
home currency.

This plan is for *this session only* — Phase A of that roadmap:
stand up FastAPI + Next.js shells with one route end-to-end
(`/api/holdings` USD-converted, rendered as an unstyled HTML table on
the React side). Dash keeps running on port 8050 in parallel; not
touched this phase.

Everything past Phase A (visual parity, advisor features, polish) is
deferred — see `plan/v3-stack-rewrite.md` Phases B/C/D.

## What's already verified

- Project tree clean: `api/` and `web/` don't exist; safe to create.
- Toolchain ready: Node 25.7.0 + npm 11.10.1 + npx at
  `/opt/homebrew/bin/`. Python 3.14 + uv already drives the Dash app.
- Data layer reuse points confirmed in
  `src/dashboard/data/{moomoo_client,anomalies,prices,positions}.py`.
  `Position` is a `@dataclass(frozen=True)` — converting to Pydantic
  is mechanical (field-for-field).
- moomoo OpenD running, REAL env, 5 live positions (MU/INTC/NBIS/ANET
  in USD + K71U in SGD) — K71U is the SGD case the FX layer must
  handle.

## Steps for this session

1. **Add Phase A deps to `pyproject.toml`.** Append `fastapi>=0.115`,
   `uvicorn[standard]>=0.32`, `yfinance>=0.2.50`, `pydantic>=2.9` to
   `dependencies`; add `api = "api.main:cli"` (or equivalent uvicorn
   launcher) under `[project.scripts]`. Run `uv sync`.

2. **Create `api/` package.** Files:
   - `api/__init__.py` — empty.
   - `api/models.py` — Pydantic `Holding`, `HoldingsResponse`, `FxRate`
     mirroring `data/positions.py:Position` plus `market_value_usd`,
     `total_pnl_usd`. Add `currency: Literal[...]` matching positions.
   - `api/fx.py` — `get_rate(pair: str) -> float` for `"USDSGD"` /
     `"USDHKD"` / etc. Uses `yfinance.Ticker(f"{pair}=X").history(period="1d")`.
     Cache in DuckDB `fx_rates` table (`pair PK, rate DOUBLE,
     fetched_at TIMESTAMP`); 1h TTL. Reuse `data/prices.py`'s
     `_DB_LOCK` pattern — same DuckDB file, separate table.
     `convert(amount, from_ccy, to_ccy="USD")` helper for
     route-side use.
   - `api/routes/__init__.py` — empty.
   - `api/routes/holdings.py` — `GET /api/holdings`. Calls
     `data.moomoo_client.fetch_positions()`, maps each to a Pydantic
     `Holding`, attaches `market_value_usd` via `fx.convert(...)`.
     Aggregate fields: `total_market_value_usd`, plus a
     `currencies: dict[ccy, subtotal_native]` for the future hero
     tooltip.
   - `api/main.py` — `FastAPI()` app, CORS allow `http://localhost:3000`,
     mounts the holdings router, `cli()` entrypoint that runs uvicorn
     on `127.0.0.1:8000` with `--reload` in dev.

3. **Verify the API in isolation.** `uv run api` → `curl
   localhost:8000/api/holdings | jq .` should return 5 holdings with
   `market_value_usd` populated. K71U's `market_value_usd` ≈
   `market_value_sgd / fx.USDSGD`. Confirm Dash app on `:8050` still
   works — `uv run dashboard`.

4. **Scaffold Next.js.** From repo root:
   `npx create-next-app@latest web --typescript --tailwind --app
   --src-dir --import-alias "@/*" --no-eslint --no-turbopack`
   (no eslint/turbopack — keep first scaffold minimal; can opt in
   later). Confirm `web/package.json` exists, `web/.next` is gitignored.

5. **Wire one fetch end-to-end.**
   - `web/src/lib/api.ts` — `fetchHoldings(): Promise<HoldingsResponse>`
     hitting `http://localhost:8000/api/holdings`. Define TS types
     mirroring the Pydantic models.
   - `web/src/app/page.tsx` — Server Component that fetches holdings
     server-side (`fetch(..., { cache: 'no-store' })`) and renders an
     unstyled `<table>`. No styling beyond Tailwind reset. The point
     is to prove the pipe; Phase B does the visual work.

6. **Update `.gitignore`** to add `web/node_modules` and `web/.next`
   (the create-next-app scaffold may already do this — verify after
   step 4).

7. **Document the dev workflow in `web/README.md`.** Two-terminal
   recipe: `uv run api` for backend, `cd web && npm run dev` for
   frontend. Note ports (8000 + 3000), CORS expectation, that
   `uv run dashboard` on 8050 is still the source of truth for v2.

8. **Commit checkpoint.** Single commit at end of session, message
   captures Phase A as a unit ("Phase A: FastAPI shell + Next.js
   scaffold + /api/holdings end-to-end"). Don't push unless asked.

## Critical files

Created:
- `Coding Projects/investment-dashboard/api/main.py`
- `Coding Projects/investment-dashboard/api/models.py`
- `Coding Projects/investment-dashboard/api/fx.py`
- `Coding Projects/investment-dashboard/api/routes/holdings.py`
- `Coding Projects/investment-dashboard/api/routes/__init__.py`
- `Coding Projects/investment-dashboard/api/__init__.py`
- `Coding Projects/investment-dashboard/web/` (scaffolded by
  `create-next-app`; primary edits land in `web/src/app/page.tsx` +
  `web/src/lib/api.ts`)
- `Coding Projects/investment-dashboard/web/README.md`

Modified:
- `Coding Projects/investment-dashboard/pyproject.toml` — deps + script
- `Coding Projects/investment-dashboard/.gitignore` — `web/node_modules`,
  `web/.next` if not added by scaffolder

Reused (read-only this phase):
- `src/dashboard/data/moomoo_client.py:fetch_positions` — source of
  truth for live holdings
- `src/dashboard/data/positions.py:Position` — dataclass that maps
  one-to-one onto the new Pydantic `Holding`
- `src/dashboard/data/prices.py` — pattern reference for
  `_DB_LOCK` + DuckDB-table caching, applied verbatim in
  `api/fx.py`

Untouched: everything under `src/dashboard/views/` and the Dash app
shell. Dash continues to run on `:8050`.

## Verification (Phase A success criteria)

1. **Both stacks running side-by-side.**
   - Terminal 1: `uv run dashboard` → `localhost:8050` renders the v2
     UI exactly as it did at commit `79ebc5e`. (Sanity: nothing in
     `src/dashboard/` was touched.)
   - Terminal 2: `uv run api` → uvicorn boots on `:8000`, no errors.
   - Terminal 3: `cd web && npm run dev` → Next.js boots on `:3000`,
     opens cleanly.

2. **`/api/holdings` returns valid JSON.**
   `curl -s localhost:8000/api/holdings | jq '.holdings | length'` → 5.
   Each item has non-null `market_value_usd`. K71U's USD value
   matches `market_value_sgd × (1/USDSGD)` within rounding.

3. **`localhost:3000` shows live holdings.** Open in browser; the
   unstyled HTML table lists 5 rows with correct USD values. Reload
   re-fetches (cache: 'no-store').

4. **No regressions in v2.** Sort/expand/anomaly drill-in on the Dash
   app behave as they did before (eyeball check on at least one
   ticker).

5. **Commit lands.** `git log -1 --stat` shows ~10–12 new files, no
   modifications under `src/dashboard/`.

## Open questions parked for Phase B/C

The four open questions in `plan/v3-stack-rewrite.md` (light/dark
theme, digest placement, notes persistence, charting library final
pick) don't block Phase A. Surface them at the start of Phase B.

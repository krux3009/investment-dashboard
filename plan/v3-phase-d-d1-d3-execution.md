# Phase D — D1+D2+D3 execution (this session)

## Context

Investment dashboard v3 is feature-complete through Phase C (daily digest, earnings strip, tomorrow's preview). The phase-level roadmap at `Coding Projects/investment-dashboard/plan/v3-phase-d.md` enumerates five Phase D candidates. This session executes the first three (notes, benchmark, concentration) in one sitting; D4 (mobile responsive) and D5 (real-time push) are explicitly dropped from session scope and stay parked at the phase plan.

The three chunks are independent — each ships as its own commit and can be aborted without affecting the others. They share three reused patterns (DuckDB single-writer with `_DB_LOCK`, advisor-pattern Claude blocks with `_PROMPT_VERSION`, frontend `Result` discriminated union) so once the first chunk lands the next two are mostly mechanical.

## Decisions locked (informed by Phase 1 exploration)

- **Order: D1 → D2 → D3.** Notes ships first because it sets the new DuckDB table and the `PUT`/`DELETE` CORS expansion; benchmark ships second on top of an already-loosened backend; concentration ships third as pure computation off `/api/holdings` plus an advisor-pattern commentary block.
- **Notes scope: holdings + watchlist (symmetric)** per session input. Same `NotesBlock` slotted inside `web/src/components/drill-in.tsx`, which is already shared by both tables.
- **Notes persistence: server-side DuckDB.** New table `notes(code PK, body TEXT, updated_at TIMESTAMP)` in the existing `data/prices.duckdb` file. No new database file. Reuse the `_DB_LOCK` + `_db()` pattern from `src/api/data/prices.py`.
- **Benchmark history: separate table `benchmark_prices(symbol, trade_date, close, PRIMARY KEY (symbol, trade_date))`** in the same DuckDB file. Not folded into `daily_prices` — moomoo-sourced rows and yfinance-sourced rows have different ownership and different freshness semantics; mixing them in one table risks confusion.
- **Benchmark default: SPY.** `MOOMOO_BENCHMARKS=SPY` is the default; comma-separated env override (e.g. `SPY,SMH`) renders multiple lines without code change. yfinance is the source — already a dep.
- **Benchmark chart: hand-rolled SVG** (matches `sparkline.tsx` and `donut.tsx` conventions). Recharts is reserved for lazy-mounted drill-ins because its `ResponsiveContainer` doesn't measure cleanly during SSR. The benchmark chart is page-level, so SVG paths it is.
- **Portfolio path computation: current-weights projected backward.** No historical reweighting (the dashboard doesn't persist position history). The chart caption states this caveat verbatim.
- **Concentration framing: observational only.** Per `feedback_financial_framing.md`, no buy/sell/hold/target/forecast/predict/recommend/should language. The component renders ratios + a stacked-bar SVG; the optional Claude commentary uses the same forbidden-words guard as Phase C advisor blocks.
- **Concentration placement: page-level under `HoldingsTable`.** Portfolio-wide signal; does not belong inside a per-stock drill-in.
- **No new dependencies.** `pyproject.toml` already has `anthropic`, `duckdb`, `fastapi`, `pydantic`, `yfinance`. `web/package.json` already has `recharts`, `next-themes`, `clsx`. New code reuses what's there.
- **CORS expands.** `src/api/main.py` currently sets `allow_methods=["GET"]`. D1 needs `PUT` and `DELETE` for notes; expand to `allow_methods=["GET", "PUT", "DELETE"]`.
- **Three commits, one per chunk.** Matches Phase B and Phase C convention. No squash.

## D1 — Position notes

### Backend

**New file `src/api/data/notes.py`.** Module-level `_db()` helper that opens the same `data/prices.duckdb` file via `_DB_LOCK` and ensures the schema:

```sql
CREATE TABLE IF NOT EXISTS notes (
  code VARCHAR PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
```

Public API: `get_note(code) -> Note | None`, `put_note(code, body) -> Note`, `delete_note(code) -> bool`. `Note` is a dataclass with `code: str`, `body: str`, `updated_at: datetime`.

**New file `src/api/routes/notes.py`.** Three handlers:

- `GET /api/notes/{code}` — 200 with `{code, body, updated_at}` if present, 404 with `{detail: "no note"}` if absent.
- `PUT /api/notes/{code}` — body is `{body: str}` (max ~10 KB; reject larger). Empty body deletes (treat as `DELETE`). Returns the persisted row.
- `DELETE /api/notes/{code}` — 204 on success, 404 if absent.

**Modify `src/api/main.py`:**

- Add `notes` to the `from api.routes import (...)` block.
- Add `app.include_router(notes.router, prefix="/api")` next to the other includes.
- Change `allow_methods=["GET"]` to `allow_methods=["GET", "PUT", "DELETE"]`.

**Modify `src/api/models.py`** to add a `Note` Pydantic model (mirror the dataclass; this is the response shape).

### Frontend

**New file `web/src/components/notes-block.tsx`** (client component):

- On mount, fetch `GET /api/notes/{code}`. 404 → empty state (italic "No notes yet."). 200 → seed the `<textarea>` with `body`.
- Debounced auto-save: 800ms after last keystroke, `PUT /api/notes/{code}` with `{body}`. Empty body → call `DELETE`.
- Display `Last saved · {relative time}` line under the textarea (warm-graphite, `--quiet`).
- `aria-label="Notes for {code}"`, `rows={4}`, `<textarea>` styling matches the warm-graphite palette (`bg-surface`, `border-rule`, IBM Plex Sans).

**Modify `web/src/components/drill-in.tsx`** to slot `<NotesBlock code={code} />` inside the right-hand column, between `<InsightBlock />` and `<AnomalyBlock />`. Single insertion serves both holdings and watchlist (component is already shared).

**Extend `web/src/lib/api.ts`** with three helpers using the existing `Result` discriminated union:

- `fetchNote(code) -> Promise<Result<Note | null>>` — collapses 404 into `ok: true, data: null`.
- `putNote(code, body) -> Promise<Result<Note>>`
- `deleteNote(code) -> Promise<Result<true>>`

Add a `Note` TypeScript type mirroring the Pydantic model.

## D2 — Performance vs benchmark

### Backend

**New file `src/api/benchmark.py`.** Module-level constants `_DB_LOCK` reuse from `data/prices.py` (or a parallel lock acquired via the shared `_db()`). Public API:

- `get_series(symbol: str, days: int) -> list[BenchmarkPoint]` — pulls daily closes from yfinance, caches in `benchmark_prices`. Refresh policy: rows older than 6h trigger a window refetch for that symbol.
- `compute_portfolio_series(holdings, days) -> list[PortfolioPoint]` — pulls per-ticker close history from the existing `prices.daily_prices` table (already cached for held symbols), weights each by current `market_value_usd`, returns daily total %Δ. Fallbacks: missing close → forward-fill from the previous trading day. Caveat string in the response: "current weights projected backward".

**New file `src/api/benchmark_insight.py`.** Advisor-pattern Claude block. Cache table:

```sql
CREATE TABLE IF NOT EXISTS benchmark_insight_cache (
  cache_key VARCHAR NOT NULL,
  prompt_version VARCHAR NOT NULL,
  what VARCHAR,
  meaning VARCHAR,
  watch VARCHAR,
  generated_at TIMESTAMP,
  PRIMARY KEY (cache_key, prompt_version)
)
```

`cache_key` = `f"{symbols_csv}|{days}|{as_of_date}"`. Module-level `_PROMPT_VERSION = "v1"`. SDK call mirrors `src/api/insight.py:_call_claude` (model from `ANTHROPIC_DIGEST_MODEL` env, `claude-sonnet-4-6` default, `max_tokens=320`, `system=` prompt + `messages=[{role:user,content:user_message}]`). The system prompt forbids the Phase C action + hype word lists verbatim:

> NEVER use these action words: buy / sell / hold / trim / add / target / forecast / predict / expect / recommend / "you should" / "you ought" / "consider [verb]" / "tomorrow".
>
> NEVER use these hype words: surge / plunge / soar / crash / breakout / rally / tank.

**New files `src/api/routes/benchmark.py` + `src/api/routes/benchmark_insight.py`:**

- `GET /api/benchmark?days=90&symbols=SPY` — returns `{portfolio: [...], benchmarks: {SPY: [...], SMH: [...]}, as_of, weighting_caveat, days, symbols}`. `days` defaults to 90; `symbols` defaults to `os.environ.get("MOOMOO_BENCHMARKS", "SPY")`.
- `GET /api/benchmark-insight?days=90&symbols=SPY` — returns the cached advisor block (lazy via `?refresh=true` to force-regenerate).

**Modify `src/api/main.py`** to register both routers next to the existing `digest` / `insight` registrations.

### Frontend

**New file `web/src/components/benchmark-chart.tsx`** (server component, hand-rolled SVG):

- Fixed `viewBox="0 0 600 200"`. Y-axis scaled to data extent + 5% padding. X-axis = days from window start.
- One `<path>` per line: portfolio in `var(--ink)`, benchmark in `var(--quiet)` (or `var(--accent)` for the active hover line later — not in this chunk).
- Inline `<text>` labels at the rightmost point of each line (ticker + final %Δ).
- `role="img"`, `aria-label` describes the comparison.

**New file `web/src/components/benchmark-block.tsx`** (client component):

- Header line: "Portfolio vs SPY · 90 days" (synthesized from response).
- Window toggle buttons: 30D / 90D / 1Y. Switching triggers refetch.
- `<BenchmarkChart>` rendered server-side (using the initial 90D fetch for first paint).
- Tabular legend below the chart: `Portfolio +X.X%`, `SPY +Y.Y%`.
- `[learn more]` toggle reuses the Phase C advisor pattern (lazy `fetchBenchmarkInsight` on first expand). Loading state = pulsing skeleton bars matching `insight-block.tsx`.
- Caveat caption (always visible, `--whisper`): "Path uses current weights projected backward."

**Extend `web/src/lib/api.ts`** with `fetchBenchmark(days, symbols)` and `fetchBenchmarkInsight(days, symbols, refresh?)`. Add TS types `BenchmarkPoint`, `BenchmarkResponse`, `BenchmarkInsight`.

**Modify `web/src/app/page.tsx`** to render `<BenchmarkBlock initialData={...} />` directly under `<Hero />`. Server-side fetch on the page so the chart paints in the SSR HTML.

## D3 — Concentration observations

### Backend

**New file `src/api/concentration.py`.** Pure computation off the existing `HoldingsResponse`:

- `top1_pct`, `top3_pct`, `top5_pct` — USD-aggregated, computed by sorting `holdings` desc by `market_value_usd` and dividing the top-N sum by `total_market_value_usd`.
- `currency_exposure` — restate `HoldingsResponse.currencies` as USD ratios using `fx.convert(...)` per currency. (Hero shows native subtotals; concentration shows USD share — different framing.)
- `single_name_max` — `{code, ticker, pct}` of the largest position.
- `count` — `len(holdings)`.

**New file `src/api/concentration_insight.py`.** Advisor-pattern. Cache table:

```sql
CREATE TABLE IF NOT EXISTS concentration_insight_cache (
  cache_key VARCHAR NOT NULL,
  prompt_version VARCHAR NOT NULL,
  what VARCHAR,
  meaning VARCHAR,
  watch VARCHAR,
  generated_at TIMESTAMP,
  PRIMARY KEY (cache_key, prompt_version)
)
```

`cache_key` = the concentration shape rounded to 2 dp (e.g. `"0.42|0.78|0.92|US.NVDA|0.42"`) so identical books hit cache. `_PROMPT_VERSION = "v1"`. Same SDK call shape as benchmark; same forbidden-words guard. Prompt explicitly forbids "rebalance" / "diversify" / "concentrated risk" framing — describe shape in plain words ("the book leans heavily on …", "USD makes up …").

**New files `src/api/routes/concentration.py` + `src/api/routes/concentration_insight.py`:**

- `GET /api/concentration` — returns `ConcentrationResponse`.
- `GET /api/concentration-insight` — returns the advisor block.

**Modify `src/api/main.py`** to register both routers.

### Frontend

**New file `web/src/components/concentration-block.tsx`** (server component for the data, client child for the [learn more] toggle):

- Quiet caption row: `Top 1 · X% · Top 3 · Y% · Top 5 · Z%` in tabular figures.
- Horizontal stacked-bar SVG (top 5 names + "rest"), single ink color with hairline rules between segments. Segments use the existing `--slice-*` tints from `globals.css` for parallelism with the donut.
- Currency exposure row: stacked-bar SVG `USD · 78% · SGD · 22%`.
- Single-name max line: `Largest position · {ticker} · {pct}%`.
- `[learn more]` toggle expands the lazy Claude commentary.
- No color signaling concentration "high/low" — single ink, hairline rules.

**Extend `web/src/lib/api.ts`** with `fetchConcentration()` and `fetchConcentrationInsight(refresh?)`. Add TS types.

**Modify `web/src/app/page.tsx`** to render `<ConcentrationBlock />` directly under `<HoldingsTable>`, before `<WatchlistTable>`. Server-side fetch.

## Critical files

### Created

- `src/api/data/notes.py`
- `src/api/routes/notes.py`
- `src/api/benchmark.py`
- `src/api/benchmark_insight.py`
- `src/api/routes/benchmark.py`
- `src/api/routes/benchmark_insight.py`
- `src/api/concentration.py`
- `src/api/concentration_insight.py`
- `src/api/routes/concentration.py`
- `src/api/routes/concentration_insight.py`
- `web/src/components/notes-block.tsx`
- `web/src/components/benchmark-block.tsx`
- `web/src/components/benchmark-chart.tsx`
- `web/src/components/concentration-block.tsx`

### Modified

- `src/api/main.py` — register four new routers; expand CORS `allow_methods` to `["GET", "PUT", "DELETE"]`.
- `src/api/models.py` — add `Note`, `BenchmarkPoint`, `BenchmarkResponse`, `BenchmarkInsight`, `ConcentrationResponse`, `ConcentrationInsight` Pydantic models.
- `src/api/data/__init__.py` — re-export `notes` if convention dictates (verify existing pattern; `prices` is referenced as `data.prices` from routes, so likely no change needed).
- `web/src/lib/api.ts` — add the eight new fetch helpers and their TS types.
- `web/src/components/drill-in.tsx` — slot `<NotesBlock code={code} />` between `<InsightBlock />` and `<AnomalyBlock />`.
- `web/src/app/page.tsx` — slot `<BenchmarkBlock initialData={...} />` under `<Hero />`; slot `<ConcentrationBlock />` under `<HoldingsTable>`.
- `Coding Projects/investment-dashboard/CLAUDE.md` — at end of session, update `## Status` to "Phase D D1+D2+D3 shipped (2026-05-04)" and append the three new surfaces to `## Surfaces`.

### Reused (read-only)

- `src/api/data/prices.py:_DB_LOCK` and `_db()` — D1 + D2 reuse the lock and DuckDB connection. New tables created in the same `if _DB is None:` block style.
- `src/api/insight.py:_call_claude` — reference for the SDK call shape (model env var, max_tokens, system prompt, `messages=[{role:user,...}]`). D2 + D3 advisor blocks copy this verbatim with their own prompts.
- `src/api/digest.py` — reference for the forbidden-words guard text and cache-table pattern.
- `src/api/fx.py:convert` and `rates_used_snapshot` — D3 currency-exposure restatement uses these.
- `src/api/routes/holdings.py:fetch_holdings` — D3 calls this directly to compute concentration off the canonical response shape.
- `web/src/components/drill-in.tsx` — D1 inserts inside; reuses the existing client-component lazy-fetch pattern.
- `web/src/components/insight-block.tsx`, `earnings-strip.tsx`, `preview-block.tsx`, `daily-digest.tsx` — reference for the static-baseline + lazy-Claude-depth + skeleton loading + 503-graceful pattern. D2 and D3 advisor blocks follow.
- `web/src/components/sparkline.tsx`, `donut.tsx` — reference for hand-rolled SVG conventions (fixed viewBox, `currentColor` / CSS-var strokes, inline `<text>` labels, aria-labels). D2's benchmark-chart and D3's concentration bars follow.
- `web/src/app/globals.css` — `--ink`, `--quiet`, `--whisper`, `--rule`, `--surface`, `--surface-raised`, `--surface-expanded`, `--accent`, `--gain`, `--loss`, `--slice-1..7` are the tokens to use. No new variables needed.
- `web/src/lib/api.ts` `Result<T>` discriminated union and `API_BASE` constant — every new fetch helper uses these.

## Out of scope (this session)

- D4 mobile responsive layout, D5 real-time push — deferred per session decision; remain documented at `Coding Projects/investment-dashboard/plan/v3-phase-d.md`.
- Notes search, multi-line markdown rendering, image attachments, version history — D1 textarea is the entire interface.
- Risk-adjusted returns (Sharpe, etc.), attribution by position, sector breakdown vs benchmark sectors, historical position-history persistence — D2 caveat absorbs the limitation.
- Sector mapping, correlation matrix, beta to benchmark, drawdown statistics, rebalancing suggestions — D3 stays observational only.
- New dependencies — no `pyproject.toml` or `package.json` changes beyond what already exists.

## Verification (end-to-end)

After all three commits land, run the following from `Coding Projects/investment-dashboard/`:

1. **Backend boots clean.** `uv run api` starts uvicorn on `:8000`, no import errors. `curl -s localhost:8000/api/health` → `{"status":"ok"}`.

2. **Notes round-trip survives restart.**
   - `curl -s -X PUT localhost:8000/api/notes/US.NVDA -H 'Content-Type: application/json' -d '{"body":"Thesis: AI-infra leader."}'` returns 200 with the persisted row.
   - Stop and restart `uv run api`.
   - `curl -s localhost:8000/api/notes/US.NVDA | jq .body` returns the same string.
   - `curl -s -X DELETE localhost:8000/api/notes/US.NVDA` returns 204; subsequent `GET` returns 404.

3. **Benchmark endpoint returns valid windows.**
   - `curl -s 'localhost:8000/api/benchmark?days=90' | jq '.portfolio | length'` ≥ 60.
   - `curl -s 'localhost:8000/api/benchmark?days=90&symbols=SPY,SMH' | jq '.benchmarks | keys'` → `["SMH","SPY"]`.
   - With `MOOMOO_BENCHMARKS=SPY,SMH` in `.env`, `curl -s localhost:8000/api/benchmark | jq '.benchmarks | keys'` → same. (Confirms env override path.)
   - `curl -s 'localhost:8000/api/benchmark-insight?days=90' | jq -r '.what + " " + .meaning + " " + .watch'` contains zero forbidden words (manual scan or `grep -E "(buy|sell|hold|trim|add|target|forecast|predict|expect|recommend|surge|plunge|soar|crash|breakout|rally|tank|should|ought|tomorrow)"` returns nothing).

4. **Concentration endpoint matches manual computation.**
   - `curl -s localhost:8000/api/concentration | jq '.top3_pct'` matches `(top 3 USD market values summed) / total_market_value_usd` from `/api/holdings`, within rounding.
   - `currency_exposure` USD ratios sum to ~1.0 (within 0.01).
   - `curl -s localhost:8000/api/concentration-insight | jq -r '.what + " " + .meaning + " " + .watch'` passes the forbidden-words scan and additionally contains no "rebalance" / "diversify" / "concentrated risk".

5. **Frontend renders three new surfaces.** `cd web && npm run dev` on `:3000`, open `localhost:3000`:
   - Hero is followed immediately by the benchmark block: title line, SVG chart with portfolio + SPY paths, tabular legend, caveat caption, `[learn more]` toggle that expands the Claude commentary on click.
   - Holdings table is followed by the concentration block: Top-1/3/5 caption, stacked-bar SVG, currency-exposure mini-bar, single-name-max line, `[learn more]` toggle.
   - Click any holdings row → drill-in expands → notes block sits between "What this means" and the anomaly section. Type in the textarea; ~800ms after stopping, the "Last saved · just now" line updates.
   - Click any watchlist row → same drill-in shape, same notes behavior.

6. **No regressions in Phase C surfaces.** Daily digest, earnings strip, tomorrow's preview render and lazy-fetch as before. Sort + theme toggle still work on the holdings table.

7. **Three commits in `git log`.** Each commit's `git diff --stat` covers exactly one chunk's files; no chunk leaks into another commit. `main` tip after the session is the third commit.

## Open questions parked for after this session

- Notes UX past one textarea: structured fields (thesis / triggers / risks)? Defer until the textarea fills with the same three headings repeatedly across positions.
- Benchmark library: include HK/SG benchmarks (`HSI`, `STI`) when those markets dominate? Defer; `MOOMOO_BENCHMARKS` env override already handles ad-hoc cases.
- D4 mobile responsive: stays parked. Trigger to unpark = a real phone-glance use that breaks.
- D5 real-time push: stays parked. Trigger to unpark = the user opens the dashboard during US RTH ≥ 3 sessions in a quarter, or a specific stale-data incident.

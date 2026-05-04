# Replace tomorrow's preview with a 7/30-day foresight section

## Context

Tomorrow's preview (futures + Asia closes — `^N225`, `^HSI`, `ES=F`,
`NQ=F`) shows symbols the user doesn't hold. With the route split done,
the home page should still answer "what's coming up that matters?" but
through holdings and macro events that affect them, not generic
indices.

The user picked: 7-day default with a 30D toggle, three event sources
(earnings, macro releases, pre-announced product/conference dates),
and full cutover (replace preview on home **and** retire the earnings
strip on /portfolio). The earnings calendar mark on the holdings table
stays — it reads `/api/earnings` for per-row dates and is the only
in-table earnings cue. The earnings strip's [learn more] depth moves
into the unified foresight insight block.

Outcome: the home page becomes Hero → Daily digest → Foresight, all
three composed for daily glance. Portfolio becomes Benchmark → Holdings
→ Concentration, leaner without the earnings strip duplicating the
calendar mark.

## Decisions locked

- **Three event types in v1**: earnings, macro releases, company events.
  Ex-dividend not selected; skip.
- **Earnings**: reuse `src/api/earnings.py:get_all()` verbatim. The
  calendar already runs through DuckDB at 24h TTL.
- **Macro releases**: static JSON committed to repo at
  `data/macro-events.json` covering FOMC + CPI + NFP + PPI for 2026.
  Schedules are public, monthly, predictable — no need for an external
  API. Hand-maintained; a one-time refresh per year keeps it current.
- **Company events**: Claude advisor pattern, per-ticker, 24h DuckDB
  cache. Prompt asks for *publicly-announced events with specific
  dates only* — no speculation. JSON-structured output parsed into
  `[{date, kind, label, description}]`.
- **Window**: 7-day default, toggle to 30D. Mirrors the
  `benchmark-block.tsx` window-button pattern.
- **Insight depth**: per-event [learn more] expands a What/Meaning/Watch
  trio cached on `event_id`. Same advisor pattern as Phase C blocks,
  same forbidden-words guard.
- **Three commits**:
  1. Backend foresight scaffolding (modules + routes + macro JSON +
     model registrations). Old preview + earnings strip still working.
  2. Frontend `ForesightBlock` lands; `web/src/app/page.tsx` swaps
     `PreviewBlock` for `ForesightBlock`; `web/src/app/portfolio/page.tsx`
     drops `EarningsStrip`.
  3. Delete the now-dead modules + components (preview.py,
     preview_insight.py, earnings_insight.py, their routes,
     preview-block.tsx, earnings-strip.tsx). Pure deletion.

## D1 — Backend foresight scaffolding

### Static macro calendar

`data/macro-events.json` — flat list, one record per release. 2026
schedule for: 8 FOMC meetings, 12 CPI prints, 12 NFP prints, 12 PPI
prints. Dates verified against BLS + FOMC public schedules at write
time. Shape:

```json
[
  {"date": "2026-05-13", "kind": "CPI", "label": "April CPI release",
   "description": "US Bureau of Labor Statistics monthly inflation print."},
  {"date": "2026-05-14", "kind": "PPI", "label": "April PPI release",
   "description": "US producer-price index, an upstream inflation gauge."},
  {"date": "2026-06-06", "kind": "NFP", "label": "May NFP release",
   "description": "US non-farm payrolls + unemployment rate."},
  {"date": "2026-06-17", "kind": "FOMC", "label": "FOMC meeting",
   "description": "Federal Reserve rate decision + dot-plot."}
]
```

### `src/api/macro_events.py`

- Read `data/macro-events.json` once per process, cache in module.
- `get_within(days: int) -> list[MacroEvent]` filters by date in
  `[today, today + days]`. Sorted ascending.
- `MacroEvent` dataclass: `date`, `kind`, `label`, `description`.

### `src/api/company_events.py`

Advisor pattern. Cache table:

```sql
CREATE TABLE IF NOT EXISTS company_events_cache (
  code VARCHAR NOT NULL,
  prompt_version VARCHAR NOT NULL,
  payload VARCHAR,            -- JSON-serialized list[CompanyEvent]
  generated_at TIMESTAMP,
  PRIMARY KEY (code, prompt_version)
)
```

- `_PROMPT_VERSION = "v1"`.
- `get_for_ticker(code, ticker, name, days_window=30) -> list[CompanyEvent]`.
- Calls `_collect()` (cache lookup → 24h TTL) → `_call_claude()` → parse
  JSON → store.
- Prompt:
  > List publicly-announced upcoming events for {ticker} ({name})
  > between {today} and {today + days_window}. Include only events
  > with confirmed specific dates: scheduled product launches,
  > investor days, scheduled conference talks (e.g. CES, GTC, JPM
  > Healthcare), pre-announced earnings call dates, scheduled board
  > meetings, lock-up expirations.
  > Do NOT include speculative or estimated events. If no confirmed
  > events exist, return an empty array.
  > Output strict JSON only:
  > `[{"date":"YYYY-MM-DD","kind":"product|investor_day|conference|earnings_call|other","label":"<short>","description":"<one sentence>"}]`
  > No prose, no preamble, no markdown.
- SDK call mirrors `src/api/insight.py:_call_claude` — model from
  `ANTHROPIC_DIGEST_MODEL` env, `max_tokens=512` (JSON list can run
  longer than 320), `system=` prompt + `messages=[user]`.
- Failure tolerance: malformed JSON → return `[]`, log warning, save
  `[]` to cache so we don't re-hit Claude on every request.
- `CompanyEvent` dataclass mirrors prompt JSON.

### `src/api/foresight.py` — aggregator

- `get_foresight(days: int) -> Foresight`:
  1. Call `earnings.get_all()`, filter `e.days_until <= days`, map each
     to `ForesightEvent(kind="earnings", code, ticker, ...)`.
  2. Call `macro_events.get_within(days)`, map each to
     `ForesightEvent(kind="macro", code=None, ticker=None, ...)`.
  3. For each held position (`get_summary().positions`), call
     `company_events.get_for_ticker(code, ticker, name, days_window=30)`
     and filter by `days_until <= days`. Map each to
     `ForesightEvent(kind="company_event", code, ticker, ...)`.
  4. Sort all events by `date` ascending.
  5. Synthesize a stable `event_id` for each event so `/foresight-insight`
     can cache: `f"{kind}|{code or 'macro'}|{date}|{slugify(label)[:40]}"`.
- `Foresight` response carries `days`, `as_of`, `events: list[ForesightEvent]`,
  `holdings_covered: list[str]`.

### `src/api/foresight_insight.py`

Advisor pattern. Cache table:

```sql
CREATE TABLE IF NOT EXISTS foresight_insight_cache (
  event_id VARCHAR NOT NULL,
  prompt_version VARCHAR NOT NULL,
  what VARCHAR,
  meaning VARCHAR,
  watch VARCHAR,
  generated_at TIMESTAMP,
  PRIMARY KEY (event_id, prompt_version)
)
```

- `_PROMPT_VERSION = "v1"`. 6h TTL (events are stable; the *meaning*
  for a given holding could shift if news lands).
- `get_insight(event_id, force_refresh=False) -> ForesightInsight | None`.
- Caller passes the full event payload + held tickers list (the
  insight is shaped by what the user owns).
- Prompt mirrors `benchmark_insight.py` shape: three lines What /
  Meaning / Watch, ≤22 words each, full forbidden-words list verbatim
  (buy/sell/hold/...rally/surge/...), plus event-specific framing:
  > Describe the event itself (What), how it connects to the listed
  > holdings (Meaning), and what an attentive investor would observe
  > as the date approaches (Watch). Do not predict the outcome of
  > the event. Do not advise. Frame everything as observation.

### Routes

- `src/api/routes/foresight.py` — `GET /api/foresight?days=7` →
  `ForesightResponse`. `days` clamped `[1, 90]`, default 7.
- `src/api/routes/foresight_insight.py` — `GET /api/foresight-insight/{event_id}?refresh=true`
  → 200 dict, 503 missing key, 404 event not in current window.

### Models (`src/api/models.py`)

```python
class ForesightEvent(BaseModel):
    event_id: str
    date: str            # ISO
    days_until: int
    kind: Literal["earnings", "macro", "company_event"]
    code: str | None
    ticker: str | None
    label: str
    description: str

class ForesightResponse(BaseModel):
    days: int
    as_of: str
    holdings_covered: list[str]
    events: list[ForesightEvent]
```

### `src/api/main.py`

- Add `foresight, foresight_insight` to the `from api.routes import (...)`
  block; register both with `prefix="/api"`.
- Don't drop `preview, preview_insight, earnings_insight` registrations
  yet — chunk 3 deletes them. Keeping the imports working through
  chunks 1 and 2 lets each chunk land independently without server
  errors.

## D2 — Frontend ForesightBlock + page swaps

### `web/src/components/foresight-block.tsx`

- `"use client"`, mounts on home page with `initial: ForesightResponse`
  fetched server-side at `days=7`.
- Local state: `days: 7 | 30`, `data: ForesightResponse`, per-event
  `expanded` and `insightByEvent` maps.
- Window toggle UI mirrors `benchmark-block.tsx`: two buttons (7D / 30D)
  with active styling. Switch fires `fetchForesight(days)` and resets
  expanded state.
- Empty state when `data.events.length === 0`: italic "No scheduled
  events in the next {days} days" with a quiet "try 30D" hint when in
  7D mode.
- Each event row:
  - LEFT: date "Mon May 6" + days-until tag in `--whisper` ("in 2d").
  - MIDDLE: kind chip (`earnings` / `macro` / `event`) + ticker (or
    "macro" placeholder).
  - RIGHT: label + short description; ends with `[learn more]` toggle
    when expanded shows three-line What/Meaning/Watch panel (skeleton
    while loading, 503 hint when key missing).
- Lazy-fetch insight: same trigger pattern as the benchmark/concentration
  blocks **but apply the bug fix from `2d6be97`** — don't put `insight.kind`
  in the effect deps. Trigger only on `[expanded[event_id]]`.
- Layout uses existing tokens: `--ink`, `--quiet`, `--whisper`, `--rule`,
  `--surface-raised`. No new colors.
- Visual rhythm: events grouped by date OR flat list — go flat for v1
  (simpler), each row has a subtle hairline divider.

### `web/src/lib/api.ts`

- Add `ForesightEvent`, `ForesightResponse`, `ForesightInsightResponse`,
  `ForesightInsightResult` types mirroring the Pydantic models.
- Add `fetchForesight(days = 7): Promise<ForesightResponse>` (throws on
  non-200, matches `fetchHoldings` shape).
- Add `fetchForesightInsight(event_id, refresh?): Promise<ForesightInsightResult>`
  — discriminated-union 503 → unavailable.
- **Don't delete** the `Preview*` / `EarningsInsight*` exports here —
  chunk 3 deletes them with the components.

### `web/src/app/page.tsx`

- Replace `import { PreviewBlock }` → `import { ForesightBlock }`.
- Add `safeFetchForesight()` wrapper (mirror `safeFetchBenchmark`).
- Promise.all gains a foresight fetch alongside `fetchHoldings()`.
- JSX swap: `<PreviewBlock />` → `{foresight && <ForesightBlock initial={foresight} />}`.

### `web/src/app/portfolio/page.tsx`

- Drop `import { EarningsStrip }` and the `<EarningsStrip ... />` mount.
- Drop `safeFetchEarnings` from the Promise.all? **No** — `earningsByCode`
  is still consumed by `<HoldingsTable>` for the calendar mark. Keep
  the fetch + the map; just don't render `<EarningsStrip>` anymore.
- Result: portfolio page renders `<BenchmarkBlock>` → `<HoldingsTable>`
  → `<ConcentrationBlock>`. Calendar mark still appears on rows
  reporting in ≤14 days.

### `Coding Projects/investment-dashboard/CLAUDE.md`

- `## Status` line bumped to `Phase D + foresight shipped (2026-05-04)`.
- Surfaces list rewritten to reflect home/portfolio/watchlist composition.
  - Tomorrow's preview line removed.
  - Foresight section added: "Next 7/30 days · earnings + macro + company
    events for held tickers, [learn more] expands per-event commentary".
  - EarningsStrip line removed; calendar mark line stays under
    "Holdings table".

## D3 — Delete dead code

Pure deletion commit. Tree changes only:

```
src/api/preview.py                                    DELETED
src/api/preview_insight.py                            DELETED
src/api/routes/preview.py                             DELETED
src/api/routes/preview_insight.py                     DELETED
src/api/earnings_insight.py                           DELETED
src/api/routes/earnings_insight.py                    DELETED
web/src/components/preview-block.tsx                  DELETED
web/src/components/earnings-strip.tsx                 DELETED
src/api/main.py                                       drop preview/preview_insight/earnings_insight imports + registrations
src/api/models.py                                     drop PreviewKind / PreviewRow / PreviewResponse / PreviewInsight types if any
web/src/lib/api.ts                                    drop Preview* + EarningsInsight* exports
```

DuckDB tables `preview_insight_cache` and `earnings_insight_cache` left
in `prices.duckdb` (cheap, harmless). User can `DROP TABLE` manually if
they care.

## Critical files

### Created
- `Coding Projects/investment-dashboard/data/macro-events.json`
- `Coding Projects/investment-dashboard/src/api/macro_events.py`
- `Coding Projects/investment-dashboard/src/api/company_events.py`
- `Coding Projects/investment-dashboard/src/api/foresight.py`
- `Coding Projects/investment-dashboard/src/api/foresight_insight.py`
- `Coding Projects/investment-dashboard/src/api/routes/foresight.py`
- `Coding Projects/investment-dashboard/src/api/routes/foresight_insight.py`
- `Coding Projects/investment-dashboard/web/src/components/foresight-block.tsx`

### Modified
- `Coding Projects/investment-dashboard/src/api/main.py` — register foresight routers; drop preview/earnings_insight in chunk 3.
- `Coding Projects/investment-dashboard/src/api/models.py` — add ForesightEvent + ForesightResponse; drop preview models in chunk 3.
- `Coding Projects/investment-dashboard/web/src/app/page.tsx` — swap PreviewBlock → ForesightBlock.
- `Coding Projects/investment-dashboard/web/src/app/portfolio/page.tsx` — drop EarningsStrip render (keep `safeFetchEarnings` for holdings calendar mark).
- `Coding Projects/investment-dashboard/web/src/lib/api.ts` — add foresight helpers; drop preview/earnings-insight in chunk 3.
- `Coding Projects/investment-dashboard/CLAUDE.md` — status + surfaces.

### Deleted (chunk 3)
- `Coding Projects/investment-dashboard/src/api/preview.py`
- `Coding Projects/investment-dashboard/src/api/preview_insight.py`
- `Coding Projects/investment-dashboard/src/api/routes/preview.py`
- `Coding Projects/investment-dashboard/src/api/routes/preview_insight.py`
- `Coding Projects/investment-dashboard/src/api/earnings_insight.py`
- `Coding Projects/investment-dashboard/src/api/routes/earnings_insight.py`
- `Coding Projects/investment-dashboard/web/src/components/preview-block.tsx`
- `Coding Projects/investment-dashboard/web/src/components/earnings-strip.tsx`

### Reused (read-only)
- `src/api/earnings.py:get_all()` — earnings stream feeding foresight + holdings calendar mark.
- `src/api/data/prices.py:_DB_LOCK + _db()` — DuckDB single-writer pattern.
- `src/api/insight.py:_call_claude` shape — JSON-mode call for company_events plus three-line call for foresight_insight.
- `src/api/digest.py` forbidden-words guard text — copied verbatim into foresight_insight prompt.
- `web/src/components/benchmark-block.tsx` — window-toggle button pattern + lazy-fetch effect deps fix from commit `2d6be97`.
- `web/src/components/insight-block.tsx` — skeleton + ready/unavailable/error state machine for the per-event [learn more].
- `web/src/lib/api.ts` `Result<T>` discriminated union pattern + `API_BASE` constant.

## Verification

End-to-end after all three commits:

1. **Backend boots clean.** `uv run api` starts without import errors
   even after chunk 3 deletes. `curl localhost:8000/api/health` →
   `{"status":"ok"}`.
2. **Macro JSON loads.** `python -c "from api.macro_events import get_within; print(len(get_within(30)))"` ≥ 4 (typical month has CPI + PPI + NFP + occasionally FOMC).
3. **`/api/foresight?days=7` returns** an `events` array with at least
   the events whose date falls in the next 7 days. `holdings_covered`
   matches the live book. Each event has a populated `event_id`.
4. **`/api/foresight?days=30`** is a strict superset of the 7D response.
5. **`/api/foresight-insight/{event_id}`** returns 200 with What /
   Meaning / Watch. Forbidden-words scan
   (`grep -E "(buy|sell|hold|trim|add|target|forecast|predict|expect|recommend|surge|plunge|soar|crash|breakout|rally|tank|should|ought|tomorrow)"`)
   returns nothing.
6. **`/api/preview` returns 404** after chunk 3.
7. **`/api/earnings` still returns 200** (calendar mark dependency).
   `/api/earnings-insight/{code}` returns 404 after chunk 3.
8. **Frontend home page** shows Hero → Daily digest → Foresight. The
   foresight block renders the next 7 days of events in date order;
   30D toggle expands the list. `[learn more]` resolves to a
   three-line block on click. No tomorrow's-preview block.
9. **Frontend /portfolio** shows Benchmark → Holdings → Concentration.
   No earnings strip. Holdings rows reporting in ≤14 days still get
   the calendar icon next to the ticker.
10. **No console errors** in the Next.js dev log on any of the three
    routes after the deletion commit.

## Out of scope (this task)

- Ex-dividend dates (user did not select).
- Conference and product-launch sourcing beyond Claude (no manual
  events table, no firecrawl scraping).
- 90D / 1Y windows on foresight (7D / 30D only).
- Non-US macro releases (ECB, China NBS, BoJ). All 2026 macro events
  are US-only because the held book is dominantly US.
- Per-event direct linking from the foresight row to the relevant
  holding's drill-in. Could be added later as a small affordance.
- Auto-refresh schedule. Foresight fetches once on mount; the user
  reloads the page when they want fresh.
- Migrating off the static macro JSON to a feed (FRED, BLS API,
  Trading Economics). Static is fine for the first user; revisit if
  the JSON drift bites.

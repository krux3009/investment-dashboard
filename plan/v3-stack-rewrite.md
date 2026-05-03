# v3 — Stack rewrite + USD-aggregated hero + advisor features

## Context

After tonight's eleven-commit haul (real-data verification → Phase 5 anomaly drill-in → v2 visual direction with donut + sparklines + drill-in chart + watchlist → moomoo-sourced watchlist → interactive watchlist drill-in → lazy-load), the dashboard is functionally complete on Dash + Plotly. Living with it surfaced four real limits:

1. **Interaction lag persists** even after lazy-load — Dash + Flask round-trips for click/expand state, no client-side memoization, every poll re-renders all 23 watchlist sparklines.
2. **The visual ceiling is real** — Dash component primitives are dated, animation is awkward, polish costs 5× what it would in React.
3. **The "S$90 SGD" caption is a UX papercut** — caused by deliberately not FX-converting; reads as confusing instead of informative.
4. **Donut requires hover for labels** — tickers should be readable without interaction.

Plus the user wants three advisor features layered in: AI daily digest, earnings calendar, tomorrow's preview.

## Decisions locked in this session

- **Stack upgrade: YES.** Move from Dash + Plotly to **FastAPI backend + Next.js + Tailwind + shadcn/ui + Recharts** for the frontend. Backend reuses the existing data layer (`data/moomoo_client.py`, `data/anomalies.py`, `data/prices.py`, `data/positions.py`) — no rewrite of the moomoo integration. Frontend is a fresh build that talks REST to FastAPI.
- **Home currency: USD.** Hero collapses to a single USD figure with FX conversion. SGD position (K71U) gets converted at the prevailing USDSGD rate. Per-currency breakdown moves to a quiet caption / drill-in detail rather than a top-level subtotal.
- **Advisor features (priority): AI daily digest, earnings calendar, tomorrow's preview.** Other tracker/advisor ideas (notes, benchmarking, concentration alerts) are deferred but listed in §"Out of scope (this rewrite)".
- **Real-time: deferred.** Timezone gap (SGT vs US market hours) makes intra-day push lower-leverage than the rewrite + advisor surface. Revisit after Phase D.

## Architecture

```
Coding Projects/investment-dashboard/
├── src/dashboard/         ← keep running on Dash for now (retire after Phase B ships)
│   ├── data/              ← unchanged; the new backend imports from here
│   └── views/             ← retired once React frontend reaches parity
├── api/                   ← NEW — FastAPI backend (port 8000)
│   ├── main.py            ← app + CORS + routes
│   ├── routes/
│   │   ├── holdings.py    ← GET /api/holdings  (USD-converted)
│   │   ├── watchlist.py   ← GET /api/watchlist
│   │   ├── prices.py      ← GET /api/prices/{code}?days=90
│   │   ├── anomalies.py   ← GET /api/anomalies/{code}
│   │   ├── digest.py      ← GET /api/digest  (AI summary, Phase C)
│   │   ├── earnings.py    ← GET /api/earnings  (Phase C)
│   │   └── preview.py     ← GET /api/preview  (Phase C)
│   ├── models.py          ← Pydantic response models
│   └── fx.py              ← FX-rate source (start with yfinance, swap later)
├── web/                   ← NEW — Next.js 14 (App Router) frontend (port 3000)
│   ├── app/
│   │   ├── layout.tsx     ← shared shell, fonts (IBM Plex), theme
│   │   ├── page.tsx       ← dashboard root (holdings + watchlist + advisor sections)
│   │   └── globals.css    ← Tailwind + warm-graphite tokens
│   ├── components/
│   │   ├── HoldingsTable.tsx
│   │   ├── WatchlistTable.tsx
│   │   ├── AllocationDonut.tsx       ← labels-on-slices, no hover-only
│   │   ├── Sparkline.tsx
│   │   ├── PriceChart.tsx            ← drill-in 90-day chart
│   │   ├── AnomalyBlocks.tsx
│   │   ├── DailyDigest.tsx           ← Phase C
│   │   ├── EarningsCalendar.tsx      ← Phase C
│   │   └── TomorrowsPreview.tsx      ← Phase C
│   ├── lib/
│   │   ├── api.ts                    ← fetch wrappers
│   │   └── theme.ts                  ← design tokens mirroring DESIGN.md
│   ├── tailwind.config.ts
│   └── package.json
├── data/                   ← DuckDB cache, unchanged (file-locked, single owner)
├── briefs/                 ← v2 design docs stay; add briefs/v3/* during rewrite
├── plan/                   ← this folder; current and future plans live here
└── pyproject.toml          ← gains fastapi + uvicorn + yfinance
```

**Key reuse points (don't rewrite):**

- `src/dashboard/data/moomoo_client.py:fetch_positions` → wrap as `GET /api/holdings`
- `src/dashboard/data/anomalies.py:fetch_all` → wrap as `GET /api/anomalies/{code}`
- `src/dashboard/data/prices.py:get_history` and `get_close_series` → wrap as `GET /api/prices/{code}`
- `src/dashboard/data/positions.py` — dataclasses become Pydantic models (small adaptation)
- `src/dashboard/theme.py` — design tokens become the source of truth for `web/lib/theme.ts` and Tailwind config

**FX conversion:** start with `yfinance.Ticker("USDSGD=X").history(period="1d")` cached for ~1 hour in DuckDB. Add `fx_rates` table:
```sql
CREATE TABLE fx_rates (pair VARCHAR PRIMARY KEY, rate DOUBLE, fetched_at TIMESTAMP);
```

**No auth, localhost only.** moomoo OpenD is local-only, so the whole stack stays local.

## Phased roadmap

### Phase A — Foundation (next session, ~1 sitting)

Stand up FastAPI + Next.js shells with one working route end-to-end: `/api/holdings` returning USD-converted holdings, rendered as a plain HTML table on the React side. No styling beyond default Tailwind reset. The point is to prove the pipe: moomoo → FastAPI → React fetches → renders.

- [ ] `api/main.py` with CORS allowing `localhost:3000`
- [ ] `api/routes/holdings.py` returning `[{ticker, qty, market_value_usd, total_pnl_pct, ...}]`
- [ ] `api/fx.py` with yfinance + 1h DuckDB cache
- [ ] Wire `uv run api` script into `pyproject.toml`
- [ ] `npx create-next-app@latest web --typescript --tailwind --app` in repo
- [ ] `web/app/page.tsx` fetches `/api/holdings` and renders an unstyled table
- [ ] Document the dev workflow in `web/README.md`: `uv run api` + `npm run dev` in two terminals

### Phase B — Visual parity (2–3 sittings)

Replace every Dash component with a styled React equivalent. Match the warm-graphite palette, IBM Plex Sans, tabular figures, hairline rules. Use shadcn/ui as the component foundation; Recharts for sparklines, donut, drill-in chart.

Key wins this phase delivers (the issues numbered in tonight's brainstorm):

- **#1 lag** disappears: clicks update React state instantly, no server round-trip; `React.memo` on rows means only the changed row re-renders.
- **#4 confusing SGD line** disappears: hero is a single USD figure with a tooltip showing per-currency breakdown.
- **#5 donut labels**: Recharts `Pie` with `label` prop, ticker drawn outside each slice large enough; small slices keep hover-only labels.

After Phase B reaches parity, retire `src/dashboard/` (delete the Dash app) and rename `web/` and `api/` to be the dashboard's primary surface. Keep `data/` as-is.

### Phase C — Advisor features (1 session per feature)

Three new sections, each independent:

1. **AI daily digest** (`/api/digest`):
   - Backend: collect today's anomaly content + news headlines for every held position; send to Claude API with prompt *"In 3–5 sentences, summarize what materially changed for this portfolio today. Flag the single most important signal first. No advice, just observation."*; cache the response for 6h in DuckDB.
   - Frontend: `<DailyDigest>` component renders the prose under the hero, in italic warm-graphite, dated.
   - Uses Anthropic SDK (already in your tooling shortlist).

2. **Earnings calendar** (`/api/earnings`):
   - Backend: yfinance `Ticker(code).calendar` per holding; cache 24h.
   - Frontend: drill-in row gets an "Earnings: Aug 22 (in 18 days)" line; holdings table gets a small calendar icon next to tickers reporting in <14 days.

3. **Tomorrow's preview** (`/api/preview`):
   - Backend: yfinance for `^GSPC` / `^IXIC` / `^N225` / `^HSI` overnight + futures (`ES=F`, `NQ=F`); show % move since last US close.
   - Frontend: small block at the page footer showing futures + Asia close, only meaningful pre-market in SGT (~21:30 SGT = pre-open in US). Hidden during US trading hours via local-time check.

### Phase D — Polish + future hooks (deferred)

Real-time push (moomoo subscribe → WebSocket → React state), position notes, performance vs benchmark, concentration alerts. Each is independently shippable; revisit when Phase C lands.

## Critical files (Phase A only)

These get *created*, not modified:
- `Coding Projects/investment-dashboard/api/main.py`
- `Coding Projects/investment-dashboard/api/routes/holdings.py`
- `Coding Projects/investment-dashboard/api/fx.py`
- `Coding Projects/investment-dashboard/api/models.py`
- `Coding Projects/investment-dashboard/web/app/page.tsx`
- `Coding Projects/investment-dashboard/web/lib/api.ts`
- `Coding Projects/investment-dashboard/web/README.md`

These get *modified*:
- `Coding Projects/investment-dashboard/pyproject.toml` — add fastapi, uvicorn, yfinance to deps; add `api` script
- `Coding Projects/investment-dashboard/.gitignore` — add `web/node_modules`, `web/.next`

The existing Dash code at `src/dashboard/` is **not touched** during Phase A. It keeps running on port 8050 in parallel until Phase B reaches parity.

## Verification (per phase)

**Phase A success = both stacks running side by side:**
1. `uv run dashboard` (port 8050) — old Dash UI still works.
2. `uv run api` (port 8000) — `curl localhost:8000/api/holdings` returns valid JSON with USD-converted market values.
3. `cd web && npm run dev` (port 3000) — open `localhost:3000`, see your 5 holdings as an unstyled HTML table with totals in USD.

**Phase B success:** `localhost:3000` renders the full Phase 4 surface (donut + holdings + watchlist + drill-ins) at visual parity with the current Dash version. Click latency for expand/collapse drops below ~50ms (purely client-side state).

**Phase C success:** each advisor section is independently visible and meaningful. AI digest reads natural and matches the dashboard voice. Earnings dates appear in drill-ins. Tomorrow's preview shows when relevant (pre-market SGT) and hides otherwise.

## Open questions (defer to next session)

These don't block Phase A but should be answered before Phase B/C:

1. **Light/dark theme for the rewrite?** Current Dash app is light-only ("Quiet Ledger" daylight scene). Worth supporting both in the React build given the new component lib makes it cheap?
2. **Where does the AI digest live exactly — top of page (most prominent) or a sidebar?** Affects the top-level layout decision in Phase B.
3. **Should the React app remember per-row notes / preferences?** If yes, IndexedDB on the client vs server-side persistence in DuckDB.
4. **Charting library final pick.** Recharts is the safe default; Tremor (built on Recharts) gives finance-tuned components for free; lightweight-charts (TradingView's lib) is sharper for candle/line but more work to theme. Recommend Recharts for Phase B, evaluate Tremor add-on for Phase C dashboards.

## Out of scope (this rewrite)

- Real-time push (Phase D, deferred per user)
- Position notes (Phase D)
- Performance vs benchmark (Phase D)
- Concentration / risk alerts (Phase D)
- Mobile responsive layout (Phase D — laptop is primary surface for now)
- Auth / multi-user / cloud deploy (never — single-user local app by design)

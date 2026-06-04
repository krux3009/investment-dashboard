# v5 — Analysis axis sub-tabs (Future / Past / Health / Dividends)

Wire the four placeholder sub-tabs in `/portfolio` → Analysis so each
shows real portfolio-level content, and fill the two `None` snowflake
axes (`future`, plus a richer `health`). Started 2026-06-04.

## Why

The Analysis tab ships Valuation (cash-flow value + PE/PS/PEG gauges).
The other four axes (`analysis-sub-tabs.tsx`) are dashed placeholders
("once an analyst-forecast feed is wired (P5+)"). The snowflake engine
(`snowflake.py`) computes `past`/`health`/`dividends` 0–6 scores but
hardcodes `valuation=None, future=None`.

## Data layer — one shared fetcher

New `src/api/fundamentals.py`, mirroring `fair_value.py` exactly:
ThreadPoolExecutor 5s timeout per yfinance call, DuckDB
`fundamentals_cache (code, payload_json, fetched_at)` PK code, 24h TTL
on populated rows / 10min on empty markers, `_to_yfinance_symbol`
(HK/SG return mostly null → grey out), single-writer via
`prices._DB_LOCK`.

One network pull per ticker covers all four axes:
- **Future** — `growth_estimates` (stockTrend +1y vs indexTrend),
  `earnings_estimate.growth` (+1y EPS), `revenue_estimate.growth` (+1y rev).
- **Past** — `income_stmt` annual Total Revenue + Net Income →
  3y revenue + earnings CAGR.
- **Health** — `balance_sheet` Total Debt / Stockholders Equity →
  debt-to-equity; Current Assets / Current Liabilities → current ratio.
- **Dividends** — reuse existing `dividends.py` / `dividends_extended.py`
  (yield, growth, quality). No new fetch.

## Per-axis surface

Each Analysis sub-tab = a portfolio-weighted headline + a per-holding
breakdown, in the existing SWS card / ComparisonGauge / bar vocabulary.

1. **Future** — portfolio fwd EPS-growth gauge vs index + per-holding
   EPS/revenue growth bars. New `future` snowflake score (0–6).
2. **Past** — portfolio 3y revenue + earnings CAGR + per-holding bars.
3. **Health** — weighted debt/equity headline + per-holding D/E +
   current-ratio chips (check/warn glyph; loud status tier).
4. **Dividends** — weighted portfolio yield + per-holding yield + the
   existing 0–6 dividend score. Compact; distinct from the full
   Dividends tab.

## Routes (thin, wrap fundamentals.py)

`/api/portfolio/future`, `/past`, `/health` under `routes/valuation.py`
(or a sibling `routes/analysis.py`). Dividends reuses existing endpoints.

## Snowflake wiring

`_compute_scores` gains `future=_bucket_future(...)`. Health optionally
upgrades to balance-sheet-based when fundamentals present, else falls
back to the current anomaly-keyword score. `get_for_portfolio` adds the
`future` axis to its weighted aggregate.

## Frontend

- `analysis-tab.tsx` — add `safe(fetchFuture/Past/Health)` to Promise.all.
- `analysis-view.tsx` — build `FutureSubTab` / `PastSubTab` /
  `HealthSubTab` / `DividendsSubTab` card sets.
- `analysis-sub-tabs.tsx` — accept four more slots beside `valuationCards`;
  drop the `PlaceholderAxis` fallback once all are wired.
- `lib/api.ts` — types + fetchers.
- `lib/i18n/strings.ts` — EN + ZH keys for every new label.

## Framing

Statement-style judgement words allowed per the snowflake convention
("strong cash position", "earnings grew 12%"); the trading-action ban
still holds (no buy/sell/target/forecast-as-recommendation). Run
`/forbidden-framing-check` on any new Claude prose; these axes are
mostly deterministic numbers + handwritten labels, so prose is minimal.

## Sequence

fundamentals.py → Future (+ snowflake score) → Past → Health →
Dividends → portfolio snowflake aggregate → i18n EN/ZH → verify
(curl each route + dark screenshot of all four sub-tabs).

## Open decision (learning-mode contribution)

The `_bucket_future` 0–6 thresholds — what forecast growth rate counts
as a 5 vs a 3 — is a domain judgment left for Li Xuan to fill, matching
the `_bucket_past` / `_bucket_dividends` style already in `snowflake.py`.

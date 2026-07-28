# Design-flaw fixes (2026-07-28) — SHIPPED same day

All phases complete + verified (endpoints, pages, tsc, tests/test_seams.py,
prompt-auditor pass). Digest `_PROMPT_VERSION` bumped v7→v8-recommend
(retry-suffix unified onto RETRY_SUFFIX_HYPE_*). Known-remaining LOWs from
the audit: snowflake caches empty statements for 6h when keyless (pre-
existing), fundamentals.py docstring mentions retired jargon bans.

Source: /codebase-design review (3-agent survey). Fix all 9 findings.

## Phases

- **A1 `data/db.py` + `data/cache.py`** — single locked DuckDB access module
  (`run/execute/execute_one/execute_df/executemany`) + JSON KV cache
  (`get/put/clear`, TTL inside). Kills 19 modules' `prices._DB_LOCK` /
  `prices._db()` private reach + 17 `_ensure_table` copies. Advisor caches
  move to new `kv_<surface>` tables; old cache tables orphan (advisor key
  absent anyway — content loss harmless).
- **A2 `advisor.py`** — one engine: `AdvisorSpec` (prompt, version, ttl,
  max_tokens, bans, lang instruction), `complete()` (key check, client
  construction w/ injectable `client=` seam, guard + retry, `None` on
  persisted hype), `parse_wmw()`, `load()/save()` cache keyed
  `key|prompt_version_with_locale`. Migrate 7 prose advisors +
  `analysts/_base` + `company_events` + `anomaly_translator` + `digest` +
  `snowflake`. Keyless behavior preserved per module (raise → 503 /
  snowflake degrade / translator passthrough / warm_cache no-op).
  Bug fixes folded in: company_events no longer caches `[]` on failure,
  gains `force_refresh`; guard unified on `_advisor_guard.has_forbidden`
  (kills `_base._has_forbidden` twin).
- **A3 layer inversions** — `routes/watchlist.py` domain logic →
  `src/api/watchlist.py`; `concentration.py` stops calling the route fn;
  `realtime.py` stops importing route private; `_live_client()` lock.
- **A4 `yf_fetch.py`** — shared timeout-wrapped `Ticker.info` fetch for
  fundamentals / fair_value / portfolio_metrics; `_to_yfinance_symbol`
  single home (`data/prices.py` version wins; dividends re-exports gone).
- **B1 `apiGet<T>`** — api.ts one error convention (throw w/ body); keep
  Result-union only for notes/reddit; kill `safeFetchX` layer in
  portfolio/page.tsx.
- **B2 `useFetch`** — one hook for the 8 hand-rolled client fetches;
  `pulseHash` builders exported from live-store.
- **B3 table helpers** — shared expand-row aria/click block, card shell,
  rowBgCls between holdings-table / watchlist-table (no full rewrite).
- **B4 sweep** — formatters onto lib/format.ts; i18n hardcoded-English
  fixes (aria-labels, price-chart, performance-chart-card, timeSince);
  zh key-check `Record<StringKey, string>`; one `StackedBar`.

Deliberate skips: full holdings/watchlist table unification (risk >
payoff now); line-chart geometry merge (sparkline/benchmark SVG stays
per-file — SSR-critical, low churn).

## Verify

Per CLAUDE.md verification list: curl /api/health, /holdings, /returns/summary,
/dividends, /foresight, /snowflake/portfolio, /api/digest (503 keyless),
pages / /portfolio(6 tabs) /watchlist render, `npx tsc --noEmit` in web.

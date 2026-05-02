---
feature: holdings-view
status: v1 shipped
ship_date: 2026-05-02
score_at_ship: 35/40 (Excellent — Nielsen heuristics, post-polish)
---

# Holdings View — v2 Backlog

v1 of the holdings view shipped at 35/40 on Nielsen's heuristics, with the Top-3 critique items (P0 CSS load, P1 keyboard, P1 sort) plus the user-elected polish round (sort reset, anomaly placeholder, time-since wording, spacing rhythm) addressed. The items below were either flagged in the post-polish critique or carried forward from the initial brief; they are explicitly deferred to v2 to avoid scope creep.

## Direction shift (2026-05-02 evening)

After living with v1 + Phase 5 (anomaly drill-in), user feedback was: too sparse, all numbers / no shape, drill-in is dry, layout feels off. Original "Quiet Ledger" brief committed to "no charts-for-the-sake-of-charts" — that hypothesis didn't survive contact with the live product. v2 direction: still typographically restrained, but with charts as first-class. Staging:

1. **Allocation donut in the hero** ✅ shipped `eaae6d0`.
2. **Phase 4 — DuckDB cache + sparklines** ✅ shipped (this commit). `data/prices.py` exposes `get_history(code, days)` and `get_close_series(code, days)` backed by a DuckDB file at `data/prices.duckdb` (gitignored). Cache refetches via `OpenQuoteContext.request_history_kline` only when the latest cached row is more than two calendar days old (weekend slack). Sparkline column added at the rightmost of the holdings table (90×22px, single trace, color tracks 30-day delta — `GAIN_HEX` / `LOSS_HEX` / `QUIET_INK_HEX`). Two infrastructure choices worth keeping in mind:
   - **Thread-safe DB access via `_DB_LOCK`.** Dash's Flask dispatch is multi-threaded; without a lock, concurrent SELECTs raise `INTERNAL Error: Attempted to access index 0 within vector of size 0`. DuckDB connections aren't thread-safe by themselves.
   - **`_UNFETCHABLE` set caches "moomoo doesn't know this code" failures.** SG.K71U returns "Unknown stock" — the user's moomoo subscription doesn't include SGX. Without this cache, the code spammed the warning every 30s on each poll. Resets on dashboard restart so an operator can re-verify after fixing access.
3. **Phase 4 — drill-in price chart** ✅ shipped (this commit). 90-day close-price line chart inside the expansion row, between the field summary and the anomaly sections. Single warm-graphite line, no fill, right-side y-axis (trading-platform convention), hover shows date + close. Reuses `prices.get_history(code, days=90)` from chunk 1; `get_history` was extended with backfill logic so a 30-day-cached ticker pulls the missing 60 days on first drill-in expansion. Decision: line chart not candlestick — fits "long-horizon, not a trading floor" from PRODUCT.md, and the line lets you read the anomaly prose against the actual trajectory at a glance.
4. **Phase 4 — watchlist view** (next session) — `views/watchlist.py` for tickers under research (NVDA, TSLA, 700.HK). Reuses the table component + sparkline column.
5. **Dedicated charts/details page** — second route, research surface for tickers (largest scope, separate session).

When all three land, re-run `/impeccable document` to refresh DESIGN.md so the seed file reflects the actual implementation rather than the v1 hypothesis.

## Deferred from post-polish critique (2026-05-02)

### P3 — Mixed-currency hero silently picks one currency

**What:** When the book spans USD / HKD / CNH, `total_pnl_pct` is computed across currencies *without FX conversion*. The hero shows a single `$X.XK` figure that conflates currency mass.

**Why deferred:** Brief §10 acknowledged "v1 shows per-currency subtotals; no FX conversion." The current behavior matches the brief's letter but not its spirit — the hero hides the currency mix it represents.

**Fix sketch (v2):** When `summary.is_mixed_currency`, either (a) show the primary-currency P&L% with `(USD only)` qualifier, or (b) suppress the hero number and show stacked per-currency P&L lines.

**Open question for v2:** does this need real FX conversion (live rates) or is per-currency-only the right philosophy?

### P3 — Keyboard model is invisible

**What:** ↑/↓/Enter/Space/Esc all work, but nothing on screen advertises the affordance.

**Why deferred:** Discoverability is a soft win; primary user is the developer (knows the model exists from this brief).

**Fix sketch (v2):** Add `aria-keyshortcuts` to the table region. Optionally: a quiet-ink shortcuts caption that appears in the page footer when first row is focused.

## Carried from v1 brief Open Questions (briefs/holdings-view.md §10)

### Sort persistence vs. spatial stability

**Tension:** Brief §10 chose "yes, persist sort" but the primary user action ("did anything materially change?") relies on a stable spatial map. After the post-polish critique, the v1 reset affordance is now visible — but a user can still set an unusual sort and forget about it.

**v2 candidates:** auto-reset sort to default after N days of no interaction; show a sticky "default sort" badge somewhere when non-default sort is active across multiple sessions; or accept v1 behavior as final.

### Anomaly skill integration

**What:** Brief §6 expansion drill-in was specified to include moomoo-anomaly notes. v1 omits the line entirely until wiring lands (post-polish change — the placeholder used to leak dev tense).

**Fix sketch (v2):** Pre-fetch anomaly results on row expansion via subprocess to a CLI wrapper around the moomoo-technical/capital/derivatives-anomaly skills. Cache results for the session. Render as plain text below the field summary; absence stays the signal when no anomaly fires.

**Update 2026-05-02 — shipped (Phase 5):** Bypassed the subprocess plan entirely. The three skills (`~/.claude/skills/moomoo-{technical,capital,derivatives}-anomaly/`) turned out to be ~100-line CLI wrappers around `OpenQuoteContext.get_{technical,financial,derivative}_unusual()` — a single moomoo SDK call each. Calling the SDK directly from `dashboard.data.anomalies` gives ~1s latency per category vs the ~5–15s `claude -p` overhead the original spec assumed, no `futu` vs `moomoo` namespace fight, and no extra runtime dependency.

Implementation: `data/anomalies.py` exposes `fetch_all(code) -> tuple[Anomaly, ...]` returning technical/capital/derivatives in display order. Each fetch is cached by `(code, kind, time_range, language_id)` for the session. `views/holdings.py:_expansion_row` appends an uppercase quiet-ink `LABEL` + warm-graphite prose block per category that has content; categories with no anomaly are silently skipped per the brief's "absence is the signal" rule. `language_id=2` (English) by default so the prose matches the dashboard voice without translation. Verified live against ANET (technical CCI/MA + derivatives large-options trade), K71U (no anomaly content → bare field summary). Screenshots: `holdings-anet-anomaly-drillin-1280.png`, `holdings-k71u-anomaly-drillin-1280.png`.

**Update 2026-05-02 — derivatives trimmed (post-ship):** Reviewed live and dropped the `derivatives` category. User is a long-horizon equity holder, not an options trader; the options-block / IV / 牛熊证 prose was clutter, not signal. `data/anomalies.py` now ships two categories — `technical` and `capital`. The pre-trim `holdings-anet-anomaly-drillin-1280.png` screenshot stays as historical evidence of the three-category state. If options ever become relevant, re-add `"derivatives"` in four spots in `anomalies.py` (literal, order tuple, method dict, label dict) — view rendering already handles arbitrary category counts.

### Mobile reflow

**What:** Brief §4 explicitly deferred mobile to v2.

**Fix sketch (v2):** At narrow widths, reflow to single-column-per-position with the same visible fields stacked. Drill-in becomes either inline (continuing the pattern) or a full-screen sheet (more native phone UX). Decide based on real phone testing.

### Watchlist surface (separate view)

**Brief:** §1 mentioned the dashboard would have watchlist + anomalies as future surfaces. v1 is holdings only.

**Fix sketch (v2):** Phase 4 in the original tooling-research roadmap. Add `views/watchlist.py` with watchlist tickers (NVDA, TSLA, 700.HK currently in raw notes); reuse the holdings table component or build a tighter glance-card grid.

## Out-of-scope deferred items

### `monotonous-spacing` deterministic detector finding

**Status:** Partially addressed in the polish round (row vertical padding bumped from `sm` to `md`). The detector may still flag it on the next critique pass; if so, additional spacing variety could be introduced in non-row chrome (gaps between hero and table, header-to-row transition).

### Re-test against real moomoo positions

**What:** All visual verification has been against `MOOMOO_USE_DEMO=true`. Real OpenD positions need trade-unlock in the OpenD GUI.

**Action when ready:** Set `MOOMOO_USE_DEMO=false` in `.env`, ensure trade is unlocked, restart server. Verify positions render correctly. Likely-problem areas: P&L sign logic on partial fills, currency assignment for HK positions with US-pricing, row count > 4 (UI density), positions with `today_change_pct=None` from market snapshots not yet wired.

**Update 2026-05-02 — real-data verification ran (`MOOMOO_USE_DEMO=false`, both `TRD_ENV=SIMULATE` and `=REAL` exercised):**

- ✅ **Position-duplication bug found and fixed.** `position_list_query` ignored `filter_trdmarket` on FUTUSG accounts and returned the full portfolio per call; with `MOOMOO_MARKETS=US,HK` everything was doubled. Fixed in `data/moomoo_client.py:fetch_positions` via dedupe-by-code. Demo data couldn't catch this — it never ran the multi-market loop.
- ✅ **Mixed-currency hero rendered cleanly with USD primary + SGD subtotal** (positions: 4× US, 1× SG). The brief's "primary currency" rule held up against live data without changes.
- ✅ **Trade unlock turned out not to be required for `position_list_query` even on `TRD_ENV=REAL`** — a useful narrowing of the OpenD setup doc's "deliberate human-in-the-loop." Unlock is needed only for order placement (not in scope for v1).
- ⚠️ **Untested edge cases (no live data to exercise):** HK position with USD pricing (no HK positions); partial-fill `pl_ratio` sign drift (no partial fills observed); `today_change_pct=None` (markets closed Saturday so `today_pl_val=0`, not None — `None` rendering still untested in production).
- 📝 **§5 ambiguity resolved (option C: hybrid).** Added `simulate_with_no_positions: bool` to `PortfolioSummary`. `fetch_positions` sets it when query succeeds clean against `TRD_ENV=SIMULATE` and the paper book is empty. Empty-state view appends a quiet-ink third line: *"Querying SIMULATE. Set MOOMOO_TRD_ENV=REAL in .env to see the live book."* Critical fix-after-fact: the `dcc.Store` JSON ser/de pair (`_summary_to_json` / `_summary_from_json` in views/holdings.py) silently drops new fields — the field had to be added at all four locations (dataclass, _summarize, ser, de) for the round-trip to land. Add this rule to the v2 mental checklist for any future PortfolioSummary additions.

**Visual evidence:**
- `briefs/screenshots/holdings-real-data-default-1280.png` — REAL book, 5 positions, USD+SGD hero handling
- `briefs/screenshots/holdings-real-simulate-empty-with-hint-1280.png` — SIMULATE empty state with the new third-line hint

## Decision log (for v2 sessions to read)

- **Hero accent:** `oklch(55% 0.12 28)` muted rust. Fired on non-zero P&L regardless of direction. *Don't* tint by gain/loss — that drift would push the design back toward Robinhood reflex.
- **Sort default:** `mkt_value desc` (= weight desc when single-currency). Persistence + reset chip combination committed at v1.
- **Spacing rhythm:** Row vertical padding is `md` (16px). The `sm` (8px) token is now reserved for tighter intra-row spacing only.
- **Polling:** 30s `dcc.Interval`. No Page Visibility API yet — defer to v2 if active-tab detection becomes a real cost concern.
- **Empty state copy:** *"No open positions. Once you hold something on moomoo, it appears here."* — matches PRODUCT.md voice. Don't add CTAs.
- **Empty SIMULATE hint (added 2026-05-02 real-data verification):** *"Querying SIMULATE. Set MOOMOO_TRD_ENV=REAL in .env to see the live book."* Renders only when `simulate_with_no_positions` fires. Direct/instructional copy is intentional for a personal tool — chosen over softer alternatives ("This is the SIMULATE account") because the user is also the developer and the actionable instruction lands faster.
- **Keyboard model:** ↑/↓ moves focus, Enter/Space toggles, Esc collapses-all. Don't add Tab-cycling shortcuts that compete with browser defaults.

## Reference screenshots in this session

- `holdings-final-default-1280.png` — v1 ship-state, default sort
- `holdings-final-expanded-1280.png` — v1 ship-state, PLTR drill-in (anomaly placeholder removed)
- `holdings-final-sort-reset-1280.png` — sort reset chip rendering on non-default sort
- `holdings-bad-day-12pct-1280.png` — synthetic −12% calm-under-volatility verification
- `holdings-keyboard-focus-1280.png` — focus-visible 2px accent ring on keyboard nav
- `holdings-pltr-expanded-postharden-1280.png` — post-CSS-fix expanded row with 2px inset accent indicator
- `holdings-real-data-default-1280.png` — first real-data render: 5 live positions (4 USD + 1 SGD), hero correctly shows USD primary
- `holdings-real-simulate-empty-with-hint-1280.png` — empty SIMULATE state with the new third-line hint

# v7 — Mobile optimization (current SWS surface)

Parked plan, drafted 2026-06-04. Not started. **Supersedes the stale D4
"Mobile responsive layout" section in [`v3-phase-d.md`](./v3-phase-d.md)
(lines ~237+)** — that spec predates the v4 SWS rewrite + v5 analysis
axes and only covers the old holdings/watchlist tables.

Goal: the dashboard is genuinely pleasant on a phone (≈390px), not just
*rendered*. Matches the PRODUCT.md "15-second daily glance" mode and the
v6 hosting Phase-0 idea (Tailscale → pull it up on the phone).

Breakpoint: collapse at **`md:` (768px)** per DESIGN.md. Below `md` =
phone layout; at/above = today's desktop layout, untouched.

---

## Current state (verified 2026-06-04 at 390px)

The layout already *reflows* — column grids stack — so it's usable for a
glance. The gaps are specific, not global.

### Already fine on mobile (stack cleanly, leave alone)
- Home hero (`flex-col md:flex-row`), allocation donut.
- KPI strips (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4` → 1-up).
- Snowflake card (single SVG), concentration / diversification bars.
- The **v5 Analysis sub-tab cards** (`grid-cols-1 md:grid-cols-2` → stack).
- Comparison gauges, dividend history bars (full-width).
- Drill-in (`lg:grid-cols-[1fr_360px]` → stacks below lg).

### Problem children (the actual work)
1. **Holdings register** (`holdings-table.tsx`) — 8 columns crushed into
   390px. Primary surface; worst offender for the daily glance.
2. **Watchlist table** (`watchlist-table.tsx`) — same shape.
3. **Returns detail** (`returns-view.tsx`) — 13-column table. A deep
   study table, not a glance surface.
4. **Calendar** (`calendar-view.tsx`) — 7-col month grid; cells too
   small at 390px.
5. **Portfolio tab strip** (`portfolio-tab-nav.tsx`) — 6 tabs, tight.
6. **Top NavBar** (`nav-bar.tsx`) — masthead + 3 tabs + EN/theme on one
   row; tight but borderline.
7. **Performance chart card** (`performance-chart-card.tsx`) — sub-toggle
   + range strip + 4-metric row crowd at narrow width.

---

## The patterns (decide per surface, stay in the SWS vocabulary)

Two collapse strategies; pick per table by reading mode:

**A. Table → stacked cards (below `md`).** For glance surfaces where a
row is really "one holding." Replace `<table>` with a list of cards
(`bg-surface-raised border border-rule rounded-xl`, the existing SWS
card vocabulary). Each card carries: ticker + name (left), the 2–3
figures that matter (right, tabular), the sparkline, and the
calendar/ƒ glyph. The whole card stays the tap target → existing
inline drill-in. Use for **holdings + watchlist**.

**B. Table → horizontal scroll (below `md`).** For deep study tables
where every column matters and a card can't hold them. Wrap in
`overflow-x-auto` with a `min-w-[…]` so the table scrolls sideways
inside the viewport instead of breaking the page. Use for **returns
detail**.

**Tab strips → horizontal scroll.** `overflow-x-auto` + `flex-nowrap` +
momentum scroll, or wrap to two rows. Apply to the portfolio 6-tab
strip; check the top NavBar (may just need smaller gaps / wrap).

**Calendar → agenda list (below `md`).** A month grid is inherently 7
columns wide; don't fight it on a phone. Below `md`, swap the grid for
a chronological event list (date headers + the same event chips +
daily P&L), reusing the existing per-day data + the tap-to-open
foresight detail panel. The grid stays at `md+`.

**Lost affordance — sorting.** When holdings/watchlist tables become
cards, the sortable column headers vanish. Add a mobile **sort control**
(a small dropdown / segmented control) that drives the same
localStorage sort state (`ql.holdings.sort`). Don't silently drop sort.

**Touch + type.** Tap targets ≥44px tall (rows are already
`role="button"` — just ensure height). Keep tabular figures + right-
alignment inside cards. No new motion; `prefers-reduced-motion` rule
unchanged.

---

## Phased order

### Phase 1 — Daily-glance essentials (highest value) — ✅ DONE 2026-06-05
The 15-second phone glance must be clean.
- ✅ NavBar: header row now `flex-wrap` + responsive gaps (`gap-4 md:gap-8`,
  nav `gap-4 md:gap-5`) + `mb-8 md:mb-12`. At 390 the EN/theme toggles wrap
  to a second line cleanly; no overflow.
- ✅ Portfolio tab strip: `overflow-x-auto flex-nowrap` + hidden scrollbar
  (`[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`), links `shrink-0
  whitespace-nowrap`. 4 tabs visible, Analysis/Calendar scroll in.
- ✅ **Holdings register → cards** below `md`. New `HoldingCard` (SWS
  `bg-surface-raised border rounded-xl`, whole card = tap target → inline
  drill-in). Card face = market value USD (primary) + total-return % +
  today % on the right; sparkline + mini snowflake + earnings/ƒ glyphs on
  the bottom-left. Desktop `<table>` now `hidden md:block` inside an
  `overflow-x-auto` wrapper (also fixes a *pre-existing* 14px page overflow
  from the 9-col table at the 768 boundary). Extracted shared `EarningsGlyph`
  / `DividendGlyph` / `sparkDirectionFor` so row + card share one source.
- ✅ **Mobile sort control** (`MobileSortControl`): scrollable pill row
  (Ticker / Value / Today / Total) driving the same `handleSort` +
  `ql.holdings.sort` localStorage as the desktop headers. New i18n keys
  `holdings.sort.*` + `holdings.card.{total,today}` (en + zh).
- ✅ Home: read fine at 390 EXCEPT a foresight `[learn more]` overflowed
  29px — the `grid-cols-[7rem_5rem_1fr_auto]` `1fr` col couldn't shrink
  below min-content. Fixed: responsive `grid-cols-[5rem_4rem_minmax(0,1fr)_
  auto] md:grid-cols-[7rem_5rem_minmax(0,1fr)_auto]` + matching expanded-body
  indent `ml-[5rem] md:ml-[7rem]`. Verified no page overflow at 390 + 768.

Verified via Playwright at 390 (cards, sort reorder, drill-in expand, no
page overflow) and 768 (table returns, scrolls in wrapper, no page overflow).
Not yet committed.

### Phase 2 — Study surfaces — ✅ DONE 2026-06-05
- ✅ Watchlist → cards (mirror holdings). New `WatchlistCard` + shared
  `deriveWatchlistRow` / `fmtLast` helpers (row + card one source). Card
  face = last price (primary) + today % + 30-day % on the right; ticker +
  market left; sparkline + mini snowflake bottom. Table now `hidden
  md:block overflow-x-auto`. No sort control (watchlist has no sort).
  Reuses `holdings.card.today` + `watchlist.col.30d` labels — no new i18n.
- ✅ Returns detail → wrapper already existed; added `min-w-[680px]` so the
  9-col table scrolls sideways inside its box instead of crushing at 390.
- ✅ Performance chart card → already `flex-wrap` header + `grid-cols-2
  md:grid-cols-4` metrics; verified clean at 390 (range strip + KPIs stack,
  BenchmarkChart scales). No change needed.
- ✅ Analysis tab → verified at 390: sub-tab nav (5 axes) fits one row,
  comparison gauges + diversification stacked bars all full-width, no
  overflow. Cards already stacked; no change needed.

Verified via Playwright at 390 (watchlist 25 cards no overflow; returns
detail scrolls in wrapper; analysis gauges/diversification stack) and 768
(watchlist table returns, cards hidden, no page overflow). Not yet committed.

### Phase 3 — Calendar
- Agenda/list view below `md`; grid stays at `md+`.

---

## Files

```
web/src/components/
  holdings-table.tsx        ← Phase 1: table→cards + sort control
  portfolio-tab-nav.tsx     ← Phase 1: scroll strip
  nav-bar.tsx               ← Phase 1: header row at 390px
  watchlist-table.tsx       ← Phase 2: table→cards
  returns-view.tsx          ← Phase 2: overflow-x-auto wrapper
  performance-chart-card.tsx← Phase 2: stack toggles/metrics
  analysis-view.tsx         ← Phase 2: spacing audit (cards already stack)
  calendar-view.tsx         ← Phase 3: agenda view below md
web/src/app/globals.css     ← only if a shared breakpoint helper is needed
web/src/lib/i18n/strings.ts ← any new mobile-only labels (sort control, etc.)
```

No backend changes — pure frontend / Tailwind. No new data, so EN+ZH
additions are limited to any new control labels.

---

## Verification

- Playwright at **390px (iPhone)** and **768px (tablet/`md` boundary)**:
  home, all six portfolio tabs, watchlist, a drill-in. Capture into a
  mobile baseline set (the existing `.playwright/baseline/*-768.png` is
  a starting point; add 390 captures).
- No horizontal page scroll at 390px on any route (tables scroll
  *inside* their wrapper, not the page).
- Sort still works on holdings/watchlist via the mobile control.
- Tap a row → drill-in opens; tap targets comfortable.
- Dark + light both pass (dark is default).

---

## Open decisions when resuming

1. Holdings/watchlist cards: which 2–3 figures earn the card face?
   (Likely: market value USD + total-return % + today %; sparkline +
   calendar/ƒ glyph alongside.)
2. Mobile sort control shape — dropdown vs segmented buttons?
3. Calendar: full agenda rewrite vs a shrunk grid with tap-to-expand
   day? (Agenda reads better on a phone; more work.)
4. Is a bottom tab bar worth it for the three top-level routes
   (home/portfolio/watchlist) on mobile, or keep the top NavBar? (Bottom
   bar is more phone-native but adds chrome — probably skip for v1.)
```

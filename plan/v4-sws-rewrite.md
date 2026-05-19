# Plan: SWS-Faithful Frontend Rewrite (v3 → v4)

> On approval, copy to `plan/v4-sws-rewrite.md` per project convention (CLAUDE.md: plans live in `plan/`, not `~/.claude/plans/`). Written here because plan-mode locks edits to a single harness path.

## Context

The dashboard currently follows "Quiet Ledger" (paper-cream + warm-graphite + IBM Plex, no green/red, prose-first advisor framing). User wants the three existing routes (`/`, `/portfolio`, `/watchlist`) to mirror their SimplyWall.st counterparts (Dashboard / Portfolios / Watchlist). Per-stock deep view (`/stocks/[code]`) is OUT of scope — inline drill-in stays.

Five pivot decisions locked with user (this turn):

1. **All 3 routes mirror SWS counterpart surfaces**, not the SWS company-analysis page.
2. **Dark mode default + gold accent** (`#D9B97A`) — SWS visual identity. Light still toggleable.
3. **Snowflake = hand-rolled SVG pentagon** (not canvas blob) — preserves project's SSR-first ethos.
4. **Per-stock dedicated page DROPPED**. Inline drill-in on row click stays, enhanced with 5-axis statement cards.
5. **/portfolio tab bar = 6 tabs**: Holdings / Returns / Updates / Dividends / Analysis / Calendar. (Drop SWS "Narratives" — no community thesis data. Keep existing Calendar.)
6. **Statement-card framing relaxed** (from earlier): SWS-style judgements allowed ("good value", "moderate debt", "strong cash position"). Trading actions stay banned (buy/sell/predict/target/recommend). FORBIDDEN_BASE splits.

## What I scraped from SWS via firecrawl (2026-05-18)

`/portfolio/demo` (publicly accessible, dark-mode, gold accent, 17 canvases for snowflakes):

- **Top nav (logged-in style):** Logo · Dashboard · Portfolios (active, gold underline) · Watchlist · Community · Discover · Screener · Search · EN · Log In/Sign Up CTA
- **Page header:** "🍿 Demo Portfolio" h1 + "Analysis updated 3h ago"
- **6 portfolio tabs:** Holdings (active, gold underline) | Returns | Narratives | Updates `[12]` | Dividends | Analysis

### Holdings tab
- 2-col top row: Performance Chart card (`Value Over Time` | `Performance Vs Market` sub-tabs) + Portfolio Snowflake card
- Chart: 4 KPI metrics (Total Value 360k · Total Returns 268k 121.7% · 1D Returns -5.5k -1.7% · Annualised IRR 23.4%) + range tabs (1M/3M/YTD/1Y/2Y/All Time) + line chart (green portfolio vs gray cost basis)
- Snowflake: 264×264 canvas, gold blob, 5 axes (VALUE top / FUTURE right / PAST bottom-right / HEALTH bottom-left / DIVIDEND left), summary line "A past performer with good growth potential", red badge `21` (risks) + green star badge `★ 42` (rewards)
- Below: 4 KPI tiles — Unrealized Returns · Realized Returns · Dividends · Currency Impact (each with green/red delta %)
- Holdings table: Symbol (link) · Last Price + "X% over/undervalued intrinsic discount" · Fair Value (with analyst avatar) · 7D % Return + $ · Total Return + $ · Value/Cost (+ basis) · Weight/Shares · Avg. Price · 1Y chart · 96×96 mini-snowflake per row

### Returns tab
- "Since inception 28/01/2015→18/05/2026"
- Returns Breakdown stacked-bar: Unrealized $202k + Realized $52k + Dividends $15k + Currency -$952 = Total $269k
- Highest / Lowest contributors lists (top 5 each, ticker + $ + %)
- Detailed Returns Report table: Ticker · Shares · Price · USD Value · Cost Basis · Unrealized · Realized · Dividends · Currency Gains · Total Gains · Annualized IRR + "Download as CSV" button

### Dividends tab
- "Next 12m Income from 10 holdings: US$4,974 (4.1% higher vs last 12m)"
- Stats row: Monthly Income · Current Yield · Yield on Cost
- Dividend History monthly bar chart (16 months horizontal)
- Largest / Smallest Contributors lists
- Dividend Quality & Forecast table: Low (0-2) / Medium (3-4) / High (5-6) score buckets with US$ totals + % + holding counts
- Forward dividend forecast: Last 12m · Next 12m · +2 year · +3 year
- Per-holding table: Symbol · +12m Payment & Contribution · Yield vs Yield on Cost · Dividend Score (X/6) & Growth

### Analysis tab
- "Key Metrics & Benchmarks" section with 5 sub-tabs matching snowflake axes: Valuation | Future Growth | Past Performance | Financial Health | Dividends
- Valuation sub-tab: 4 comparison cards
  - Future Cash Flow Value: "10.9% Undervalued · Total Value 333k · Cash Flow Value 374k"
  - Price to Earnings: 0x–60x horizontal scale + table (portfolio 27.3x vs US Market 18.4x)
  - Price to Sales: similar
  - Price to Expected Growth: similar
- Diversification section:
  - Diversification across Industries (sunburst/multi-level: sector → industry → ticker; per-tier % bars)
  - Diversification across Holdings (top 10 % weight bars, expanded card showing Value/1Y/7D)
  - Revenue Diversification by Geography (4 regions, % breakdown, click-to-expand per region)

### Tech tells
- Snowflake = HTML canvas (1 main 264×264 + 16 mini 96×96 per holding row)
- Charts = visx (SVG, `Portfolio Equity Curve` aria-label, gradient fills via `<linearGradient id="positive-chart">`)
- Tailwind tokens: `--s-color-good`, `--s-color-brand-02` (gold), `bg-soft`, `text-softer`, spacing scale `h-x5`, `gap-x0_5`
- Fonts: Bureau Sans + Bureau Serif. We substitute with IBM Plex Sans + Mono + Plex Serif (Plex Serif covers display headers).
- Border-radii: 4 / 6 / 8 / 16 / 40 (pills) / 50%
- Dark surfaces, hairline borders, no shadows

## A. Per-route information architecture

### `/` (Dashboard)
Mirror SWS Dashboard ethos — "command center". One-portfolio version:

| Order | Section | Source |
|---|---|---|
| 1 | Hero: total value + 1D delta + signed P&L + currency-breakdown caption + **mini snowflake (96)** right-side | `useLiveTotals()`, new `/api/snowflake/portfolio` |
| 2 | KPI tiles strip (4): Unrealized · Realized · Dividends · Currency Impact | new `/api/returns/summary` |
| 3 | DailyDigest grid (preserved) | existing `/api/digest` |
| 4 | ForesightSection (preserved) — analog of SWS Updates feed | existing `/api/foresight` |

### `/portfolio`
Direct mirror of SWS `/portfolio/demo`:

**Header strip:** Page title "My Portfolio" + "Updated Nh ago" + (optionally a "Currency: USD" selector right-side).

**Tab bar (gold-underline active):**

| Tab | Content |
|---|---|
| **Holdings** | 2-col top: Performance chart + Portfolio Snowflake card. Then 4 KPI tiles. Then Holdings table with mini-snowflakes. |
| **Returns** | Returns breakdown stacked-bar + Contributors lists + Detailed Returns Report table + CSV download |
| **Updates** | Reuses existing `ForesightSection` content (earnings + macro + company events) styled as an "updates feed" |
| **Dividends** | Next-12m income card + Dividend History bars + Contributors + Quality buckets + Forward forecast + per-holding table |
| **Analysis** | 5 axis sub-tabs (Valuation / Future / Past / Health / Dividends) — each shows comparison gauges. Then Diversification section (Industries / Holdings / Geography). |
| **Calendar** | Existing `CalendarView` (preserved, dark-themed) |

### `/watchlist`
Mirror SWS Watchlist (we don't have visuals but extrapolating from Holdings):

| Order | Section |
|---|---|
| 1 | Header "Watchlist (Ncodes)" + "Updated Nh ago" |
| 2 | Watchlist table: Symbol · Last Price · Fair Value (stubbed if no data) · 7D % Return · Mini-snowflake · 1Y chart |
| 3 | Per-row inline drill-in (preserved + enhanced) |

## B. Drill-in enhancement (replaces dropped /stocks/[code])

Files: `web/src/components/drill-in.tsx` (existing, augmented).

Existing sections preserved: 90d PriceChart, InsightBlock, NotesBlock, SentimentBlock, AnomalyBlock.

**New section: 5-axis Statement Card grid.** Render between PriceChart and InsightBlock:

- Per-axis card cluster (Past / Health / Dividend; Valuation + Future render greyed "Data not yet available" until peer/forecast data layer ships).
- Each cluster: axis name + score chip ("4/6") + 3-5 StatementCards stacked.
- Cards use relaxed framing — "Earnings grew 153.7% over past year" / "Trading 31.5% below fair value" / "Dividend not well covered by free cash flows".

Data source: new `/api/snowflake/{code}` (returns scores + per-axis statement bullets).

## C. Snowflake component (hand-SVG pentagon)

File: `web/src/components/snowflake.tsx`. SSR-friendly.

```ts
interface SnowflakeProps {
  scores: { valuation?: number|null; future?: number|null; past?: number|null; health?: number|null; dividends?: number|null };
  size?: 28 | 96 | 240;        // mini-table | strip/row | header card
  showLabels?: boolean;          // hide on 28
  showRings?: boolean;           // hide on 28
  variant?: "default" | "portfolio";  // portfolio = larger labels, summary affordance
}
```

Visual:
- Regular pentagon, vertices at 90° / 162° / 234° / 306° / 18° (TOP-VALUE / UL-FUTURE / LL-PAST / LR-HEALTH / R-DIVIDEND — order matches SWS counterclockwise from top).
- 6 concentric pentagon rings (`stroke var(--rule)` 0.5px) — only shown for ≥96 sizes.
- Data polygon: fill `color-mix(in oklch, var(--accent-primary) 28%, transparent)` (gold tint), stroke `var(--accent-primary)` 1.5px, vertex dots 3px.
- Greyed axis (null score): dashed line to outer ring, axis label gets "—" suffix.
- Labels (`text-[10px] uppercase tracking-[0.06em] text-quiet`) curved around outside ring at each vertex.
- 28×28 mini: just polygon + 5 vertex dots, no rings, no labels.

Used in: `/` hero, `/portfolio` Holdings tab snowflake card, holdings table row, watchlist table row, drill-in axis chips.

## D. KPI tile component

File: `web/src/components/kpi-tile.tsx`.

```ts
interface KpiTileProps {
  label: string;          // "Unrealized Returns"
  value: string;          // "US$201,505"
  delta?: { signed: string; pct: string; sign: "pos"|"neg"|"flat" };
  sub?: string;           // "91.4%"
  tone?: "default"|"muted";
}
```

Visual: `rounded-xl border border-rule bg-surface-raised p-x4 flex flex-col gap-x1`. Label uppercase `text-[10px] tracking-[0.08em] text-quiet`. Value `text-2xl font-medium font-mono tabular-nums text-ink`. Delta inline (arrow + signed value): `--accent-success` for pos, `--accent-danger` for neg, `--quiet` flat.

Used in: `/` hero KPI strip (4 tiles), `/portfolio` Holdings tab (4 tiles).

## E. Statement card component (relaxed framing)

File: `web/src/components/statement-card.tsx`.

```ts
interface StatementCardProps {
  icon: "check" | "warn" | "neutral";
  category: "valuation"|"future"|"past"|"health"|"dividend";
  headline: string;       // ≤25 words; judgement language allowed
  sub?: string;           // ≤40 words context
}
```

Visual: `rounded-xl border border-rule bg-surface-raised p-x5 flex gap-x4`. Icon: `w-x8 h-x8` rounded-full. ✓ filled `--accent-success`, ⚠ filled `--accent-warn`, neutral = ink outline. Headline `text-sm font-medium text-ink leading-snug`. Sub `text-xs text-quiet mt-x1`.

**Framing rules (relaxed):**
- ✅ Allowed: "good value", "moderate debt", "strong cash position", "significant insider buying", "earnings forecast to grow X% per year", "trading X% below fair value"
- ❌ Banned (FORBIDDEN_TRADING_ACTIONS — applied only to snowflake aggregator): buy / sell / hold / trim / add / target / forecast / predict / expect / recommend / should / ought / breakout / rally / plunge / surge / soar / crash / bullish / bearish

Mapping rule: ✓ when metric on favorable side of median/threshold, ⚠ unfavorable, neutral if no benchmark. Aggregator prompt emits `{icon, headline, sub}` directly.

Used in: drill-in 5-axis grids, Analysis tab axis sub-tabs.

## F. Comparison gauge card (Analysis tab)

File: `web/src/components/comparison-gauge.tsx`.

```ts
interface ComparisonGaugeProps {
  title: string;                // "Price to Earnings"
  portfolio: number;            // 27.3
  market: number;               // 18.4
  scaleMax: number;             // 60
  unit?: string;                // "x"
  sub?: string;                 // "1 holding excluded due to missing data"
}
```

Visual: card with title, horizontal scale bar (0 to `scaleMax`) with two markers — portfolio (gold) + market (gray); compact table below (rows: `portfolio: 27.3x`, `US Market: 18.4x`); optional sub caption.

Used in: `/portfolio` Analysis tab sub-cards (P/E, P/S, PEG, Yield, Debt-to-Equity, etc).

## G. Theme — dark default + gold accent

File: `web/src/app/globals.css`. Major flip: dark becomes the default root, light moves to `.light` class.

```css
:root {
  /* surfaces — dark default */
  --surface:           oklch(14% 0.01 240);   /* near-black bg */
  --surface-raised:    oklch(18% 0.01 240);   /* card */
  --surface-zebra:     oklch(20% 0.01 240);
  --surface-hover:     oklch(22% 0.01 240);
  --surface-expanded:  oklch(16% 0.01 240);
  --ink:               oklch(94% 0.005 80);   /* near-white text */
  --quiet:             oklch(72% 0.01 80);
  --whisper:           oklch(55% 0.01 80);
  --rule:              oklch(28% 0.005 240);  /* hairline */
  /* accents */
  --accent-primary:    #D9B97A;               /* SWS gold */
  --accent-strong:     oklch(78% 0.12 80);
  --accent-success:    #00DA5A;               /* positive ↑ */
  --accent-danger:     #D6002A;               /* negative ↓ */
  --accent-warn:       #EB7930;               /* warn ⚠ */
  --accent-tint:       color-mix(in oklch, var(--accent-primary) 30%, transparent);
  /* chart slices reused */
  --slice-1:           oklch(82% 0.08 80);
  --slice-2:           oklch(72% 0.07 60);
  --slice-3:           oklch(60% 0.06 40);
  --slice-4:           oklch(50% 0.05 20);
  --slice-5:           oklch(42% 0.04 360);
  --slice-6:           oklch(35% 0.03 340);
  --slice-7:           oklch(28% 0.02 320);
}
.light {
  --surface:           oklch(98% 0.01 80);
  --surface-raised:    oklch(95% 0.01 80);
  /* ... mirror remaining ... */
  --ink:               oklch(20% 0.01 240);
}
@theme inline {
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-ink: var(--ink);
  --color-quiet: var(--quiet);
  --color-rule: var(--rule);
  --color-accent: var(--accent-primary);
  --color-success: var(--accent-success);
  --color-danger: var(--accent-danger);
  --color-warn: var(--accent-warn);
}
```

**Theme migration:** existing `next-themes` config flips: `defaultTheme="dark"`, system follow still available via `system` option. Toggle cycles `dark → light → system → dark`. Migrate existing CSS var consumers — anywhere the code references `--accent` (rust) now reads gold. Spot-check Sparkline / BenchmarkChart / Donut color outputs.

**Typography:** Add `IBM Plex Serif` from `next/font` for display headings (h1 only). Mono stays for numeric cells.

## H. Backend additions

Five new modules + FORBIDDEN_BASE split.

### 1. `src/api/snowflake.py`
Hybrid scoring (deterministic 0-6 + Claude JSON statement bullets):
- `past`: bucket of `(total_return + 30d_delta)/2` → 0-6
- `health`: capital-flow anomaly net count → 0-6
- `dividends`: TTM yield × payment-consistency → 0-6 (0 if non-payer)
- `valuation`: null (defer until peer-P/E data layer)
- `future`: null (defer until analyst forecast layer)
- Claude JSON prompt: `{past: [{icon, headline, sub}], health: [...], dividend: [...]}`. Max 5 bullets per axis. Apply `has_forbidden(FORBIDDEN_TRADING_ACTIONS)` post-check + single retry.
- Endpoints: `GET /api/snowflake/{code}`, `GET /api/snowflake/portfolio` (weighted aggregate).
- DuckDB `snowflake_cache` keyed on `(code, prompt_version)`, 6h TTL.

### 2. `src/api/returns.py`
Returns breakdown — unrealized / realized / dividends / currency / total per holding + IRR.
- Read positions from moomoo (existing `Position` data) + DuckDB cost-basis ledger (new: requires user input or moomoo transaction history if exposed).
- Endpoints: `GET /api/returns/summary` (totals), `GET /api/returns/detail` (per-holding table), `GET /api/returns/contributors?n=5` (top/bottom 5).
- If moomoo doesn't expose realized P&L / cost basis (likely doesn't — moomoo OpenD typically only gives current positions + avg price), stub `realized: 0`, `currency: 0`, derive `unrealized = current_value - cost_basis_from_avg_price`. Note in Returns tab caption.

### 3. `src/api/portfolio_metrics.py`
Analysis-tab data: sector breakdown, geography breakdown, top-10 holdings.
- `GET /api/portfolio/sectors` → `[{sector, industry?, weight_pct, tickers}]` (yfinance `Ticker.info.sector` + `industry`, cached 24h).
- `GET /api/portfolio/geography` → `[{region, weight_pct, tickers}]` (derived from `Ticker.info.country` mapped to region buckets N.America / Europe / Asia-Pacific / ROW).
- `GET /api/portfolio/top-holdings?n=10` → sorted by USD market value.

### 4. `src/api/fair_value.py` (Analysis tab — Valuation sub-tab)
Aggregates yfinance analyst targets + intrinsic-value-vs-current per holding.
- `GET /api/portfolio/valuation` → `{cash_flow_value, total_value, pct_diff, per_holding: [{code, current, fair, pct_diff}]}`
- `GET /api/portfolio/pe-vs-market`, `pe-vs-sector`, `ps-vs-market`, `peg-vs-market` — comparison gauge data
- Source: `yf.Ticker(code).info.forwardPE / priceToSalesTrailing12Months / pegRatio` + holdings-weighted aggregate. Sector median = yfinance industry quote (cached 24h).
- Some fields will be null for HK/SG tickers — render greyed gauges with "Data not available" caption.

### 5. `src/api/dividends_extended.py` (extends existing dividends module)
Forward-12m dividend forecast + score buckets + per-holding yield-on-cost.
- `GET /api/dividends/forecast?horizon=12m|24m|36m` → `{total, monthly, holdings: [{code, payment_12m, yield_pct, yield_on_cost_pct, score, growth_pct}]}`
- `GET /api/dividends/quality-buckets` → `{low: {total, pct, count}, medium: {...}, high: {...}}` (uses snowflake dividend score)
- Reuses existing `dividends_insight.py` cache pattern.

### FORBIDDEN_BASE split in `src/api/analysts/_base.py`

```python
FORBIDDEN_TRADING_ACTIONS = [
    "buy", "sell", "hold", "trim", "add", "target", "forecast",
    "predict", "expect", "recommend", "should", "ought",
    "bullish", "bearish", "surge", "plunge", "soar", "crash",
    "breakout", "rally", "tank",
    # CN
    "买入", "买进", "卖出", "卖空", "持有", "加仓", "减仓",
    "建仓", "清仓", "目标价", "预测", "预计", "推荐", "建议",
    "应该", "理应", "看多", "看涨", "看空", "看跌",
    "大涨", "暴涨", "飙升", "大跌", "暴跌", "崩盘", "突破点", "反弹",
]
FORBIDDEN_BASE_FULL = FORBIDDEN_TRADING_ACTIONS + [
    "notable","notably","significant","significantly","remarkable","remarkably",
    "impressive","impressively","strong","weak","robust","solid","sharp","stark",
    "dramatic","dramatically","modest","outsized","massive","registers","boasts",
    "showcases","demonstrates","highlights","momentum","decelerat","mover",
    "显著","重大","出色","强劲","疲软","稳健","急剧","戏剧性","动能","势头",
]
```

Snowflake aggregator imports `FORBIDDEN_TRADING_ACTIONS` only. All 12 existing modules continue using `FORBIDDEN_BASE_FULL`. One-shot rename `FORBIDDEN_BASE` → `FORBIDDEN_BASE_FULL` audited via `grep -rn "FORBIDDEN_BASE\b" src/api/`.

## I. Phased delivery

| Phase | Hours | Ships | Output |
|---|---|---|---|
| **P1 — Foundations** | 10-14 | Dark theme + gold accent + `Snowflake` + `KpiTile` + `StatementCard` + `ComparisonGauge` components + dev demo page `/__components` (NODE_ENV !== production). next-themes default flip. IBM Plex Serif added. | Compiles. Components render with mock data. Visual baseline. |
| **P2 — `/portfolio` Holdings tab** | 12-16 | Page renames "My Portfolio" + 6-tab bar (Holdings active; others stub). Holdings tab: Performance chart card + Snowflake card (stubbed scores) + 4 KPI tiles + reskinned `HoldingsTable` with mini-snowflake col + "X% over/undervalued" badge under price. | Holdings tab visually mirrors SWS. Other tabs render "Coming soon" panels. |
| **P3 — `/portfolio` Returns + Dividends + Analysis + Calendar tabs** | 16-20 | Returns tab full content (breakdown + contributors + detail table + CSV). Dividends tab full content (income card + history bars + contributors + quality buckets + forecast + table). Analysis tab (5 axis sub-tabs + diversification sections). Calendar tab restyled dark. | All 6 portfolio tabs functional with stubbed/cached data. |
| **P4 — `/` Dashboard rewrite + `/watchlist` rewrite** | 10-14 | Hero with mini-snowflake + KPI tile strip + retained DailyDigest + Foresight. Watchlist table reskinned with mini-snowflake col. | Three routes visually consistent SWS-faithful. |
| **P5 — Backend (snowflake + returns + portfolio metrics + fair value)** | 14-18 | `src/api/snowflake.py` + `returns.py` + `portfolio_metrics.py` + `fair_value.py` + `dividends_extended.py`. FORBIDDEN_BASE split + import rename across 12 modules. Routes registered. Caches warmed. | All stubbed UI now backed by real data. |
| **P6 — Drill-in enhancement** | 6-8 | Inline `DrillIn` gets 5-axis StatementCard grid (Past/Health/Dividend; Valuation+Future greyed) between PriceChart and InsightBlock. | Row click drill-in matches new visual + adds statement-card depth. |
| **P7 — Polish + Playwright visual regression** | 4-6 | Spot-check Sparkline/Donut/BenchmarkChart palette swap. Tick-pulse animation tuned for dark surface. Mobile breakpoints holes patched (lg: scope only). Visual regression baseline + diff. | Ship-ready. |
| **Total** | **72-96h** | | |

P1 + P2 ship as Phase A (UI shell on stubs). P3 + P4 ship as Phase B (full visual surface). P5 + P6 ship as Phase C (real data wired). P7 final.

## J. Critical files

### P1 — Foundations
- `web/src/app/globals.css` — dark default tokens + light class + gold accent + 4 status tokens
- `web/src/components/theme-provider.tsx` — flip `defaultTheme="dark"`
- `web/src/components/snowflake.tsx` (new) — hand-SVG pentagon, 3 sizes
- `web/src/components/kpi-tile.tsx` (new)
- `web/src/components/statement-card.tsx` (new)
- `web/src/components/comparison-gauge.tsx` (new)
- `web/src/app/(dev)/__components/page.tsx` (new) — dev-only demo
- `web/src/app/layout.tsx` — wire IBM Plex Serif `next/font`

### P2 — Portfolio Holdings tab
- `web/src/app/portfolio/page.tsx` — new tab bar + Holdings tab content
- `web/src/components/portfolio-tab-nav.tsx` — extend to 6 tabs
- `web/src/components/performance-chart-card.tsx` (new) — replaces `benchmark-block` for Holdings tab top-left
- `web/src/components/snowflake-card.tsx` (new) — wraps Snowflake + summary line + risk/reward badges
- `web/src/components/kpi-strip.tsx` (new) — 4 KPI tiles row
- `web/src/components/holdings-table.tsx` — reskin dark, add mini-snowflake `<td>`, intrinsic-discount badge under price
- `web/src/lib/api.ts` — `fetchSnowflake(code)`, `fetchPortfolioSnowflake()`, `fetchReturnsSummary()` types/stubs

### P3 — Other tabs
- `web/src/app/portfolio/page.tsx` — tab-content router
- `web/src/components/returns-tab.tsx` (new) — breakdown bar + contributors + table + CSV
- `web/src/components/dividends-tab.tsx` (new) — income card + history bars + contributors + buckets + forecast + table
- `web/src/components/analysis-tab.tsx` (new) — 5 sub-tabs + diversification sections
- `web/src/components/diversification-sectors.tsx` (new) — sunburst SVG
- `web/src/components/diversification-geography.tsx` (new) — region bars
- `web/src/components/diversification-holdings.tsx` (new) — top-10 weight bars + expand-card
- `web/src/components/calendar-view.tsx` — dark-theme spot-check

### P4 — Dashboard + Watchlist
- `web/src/app/page.tsx` — restructure: hero + KPI strip + digest + foresight
- `web/src/components/hero.tsx` — extend with mini-snowflake right-side; dark surface
- `web/src/components/watchlist-table.tsx` — reskin dark + mini-snowflake col
- `web/src/components/daily-digest.tsx` — dark surface spot-check
- `web/src/components/foresight-block.tsx` — dark surface spot-check

### P5 — Backend
- `src/api/analysts/_base.py` — split `FORBIDDEN_BASE` → `FORBIDDEN_TRADING_ACTIONS` + `FORBIDDEN_BASE_FULL`
- `src/api/_advisor_guard.py` — accept ban-list param
- 12 existing advisor modules — rename import to `FORBIDDEN_BASE_FULL`
- `src/api/snowflake.py` (new) — scoring + JSON prompt + cache
- `src/api/returns.py` (new) — breakdown per holding
- `src/api/portfolio_metrics.py` (new) — sector/geography
- `src/api/fair_value.py` (new) — valuation aggregator
- `src/api/dividends_extended.py` (new) — forecast + buckets
- `src/api/routes/snowflake.py` (new), `routes/returns.py` (new), `routes/portfolio.py` (new), `routes/valuation.py` (new), extend `routes/dividends.py`
- `src/api/main.py` — register 5 new routers + warm caches

### P6 — Drill-in
- `web/src/components/drill-in.tsx` — insert 5-axis StatementCard grid between PriceChart and InsightBlock

### P7 — Polish
- `web/src/components/sparkline.tsx`, `donut.tsx`, `benchmark-chart.tsx` — palette spot-check (gain → gold or stay forest? defer to user pick)
- `web/src/components/live-indicator.tsx` — dark contrast tune
- `.playwright/baseline/` — visual regression baselines

## K. Reused components (preserved)

- **Live infra:** `live-prices-provider`, `live-store.ts`, `use-live-prices`, `use-tick-pulse`, `live-indicator`, all consumer hooks. Tick-pulse class fade tinted with `--accent-tint` (gold).
- **Existing blocks rendered inside new layouts:** `PriceChart`, `InsightBlock`, `NotesBlock`, `SentimentBlock`, `AnomalyBlock`, `DailyDigest`, `ForesightSection`, `BenchmarkSection`, `ConcentrationSection`, `DividendLedgerBlock`, `CalendarView`.
- **Hand-SVG charts:** `Sparkline` (gain direction → gold or stay forest), `Donut` (slice palette stays), `BenchmarkChart` (portfolio line → gold stroke).
- **Theme/locale:** `theme-provider`, `theme-toggle`, `locale-provider`, `locale-toggle`, `nav-bar` (restyled for dark + gold underline active).

## L. Migration risks

1. **FORBIDDEN_BASE rename**: 12 modules import the constant. Grep before/after to confirm zero misses.
2. **Theme flip blast radius**: every component reading `--accent` gets gold instead of rust. Spot-check Sparkline / Donut / BenchmarkChart / tick-pulse / focus rings.
3. **next-themes default flip**: existing users on light mode persist their preference in localStorage (`next-themes` writes `theme` key). New defaults only apply to first-time visitors. Acceptable.
4. **Snowflake aggregator first JSON prompt**: structured-output is new territory. Use Anthropic SDK JSON-mode if available, else prefix `{` and post-parse with try/except; empty-list fallback per axis.
5. **Returns tab cost basis**: moomoo OpenD likely exposes only `qty + avg_price`, not realized-P&L or transaction history. Realized + currency tabs may render "Connect transactions for full detail" stub.
6. **Analysis tab valuation gauges**: yfinance data spotty for HK/SG/AU tickers. Render greyed cards with "Data not available" caption for those.
7. **DrillIn enhancement**: existing playwright snapshots break. No tests currently — low risk.
8. **Cache invalidation on prompt edit**: bump `_PROMPT_VERSION` in `snowflake.py` after each iteration. Run `prompt-bump` skill.

## M. Verification

### Browser checklist per route (dark default)

- **`/`**: dark bg, hero shows total + mini-snowflake (gold pentagon), 4 KPI tiles tick on SSE, DailyDigest unchanged, Foresight unchanged.
- **`/portfolio`**: 6-tab gold-underline bar; Holdings tab shows perf chart (gold portfolio line, gray cost basis) + Snowflake card (gold pentagon polygon) + 4 KPI tiles + Holdings table with mini-snowflake column + intrinsic-discount badge under price; tabs Returns / Dividends / Analysis / Calendar render their respective surfaces.
- **`/watchlist`**: dark watchlist table with mini-snowflake column; row click expands existing drill-in (now with 5-axis statement cards).
- **Theme toggle**: cycles dark → light → system → dark. Light variant renders cleanly (no missing tokens).

### API curl checks

```bash
curl -s 'http://127.0.0.1:8000/api/snowflake/US.AAPL' | jq '.scores, .statements.past[0]'
curl -s 'http://127.0.0.1:8000/api/snowflake/portfolio' | jq '.scores'
curl -s 'http://127.0.0.1:8000/api/returns/summary' | jq
curl -s 'http://127.0.0.1:8000/api/returns/detail' | jq '.holdings[0]'
curl -s 'http://127.0.0.1:8000/api/portfolio/sectors' | jq '.[] | {sector,weight_pct}'
curl -s 'http://127.0.0.1:8000/api/portfolio/geography' | jq
curl -s 'http://127.0.0.1:8000/api/portfolio/valuation' | jq '.pct_diff,.cash_flow_value'
curl -s 'http://127.0.0.1:8000/api/dividends/forecast?horizon=12m' | jq '.total,.holdings[0]'
curl -s 'http://127.0.0.1:8000/api/dividends/quality-buckets' | jq
```

### Forbidden-framing audit

- `forbidden-framing-check` skill on `src/api/snowflake.py` — confirm `FORBIDDEN_TRADING_ACTIONS` catches buy/sell/predict but allows strong/moderate/significant.
- `forbidden-framing-check` on `src/api/insight.py` — confirm `FORBIDDEN_BASE_FULL` still in force (no regression).

### SSE regression

Open `/portfolio` Holdings tab. Confirm EventSource on `/api/stream/prices`. Tick-pulse fires gold-tinted on row updates. Navigate to other tabs — connection persists (`LivePricesProvider` at layout root). Mini-snowflake column updates if a holding's snowflake refreshes mid-session.

### Visual regression

Playwright `browser_take_screenshot` per route at 1440×900 + 768×1024 (tablet). Compare against P0 baselines stored in `.playwright/baseline/`. Allowed-diff threshold for dark-mode rollout: 100% (full repaint). Re-baseline after P7.

### Cache invalidation drill

Bump `_PROMPT_VERSION` in `snowflake.py`, run `prompt-bump`. Reload `/portfolio` Holdings tab. Network panel shows snowflake regeneration. Second reload — cached.

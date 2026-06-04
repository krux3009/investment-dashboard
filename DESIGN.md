---
name: Quiet Ledger
description: A paper-and-ink reading room for a long-horizon personal portfolio. The opposite of Robinhood.
colors:
  surface: "oklch(96% 0.005 75)"
  surface-raised: "oklch(98% 0.004 75)"
  surface-zebra: "oklch(94.5% 0.006 75)"
  surface-hover: "oklch(93% 0.008 75)"
  surface-expanded: "oklch(94% 0.008 75)"
  ink: "oklch(20% 0.008 60)"
  quiet: "oklch(45% 0.008 60)"
  whisper: "oklch(58% 0.007 65)"
  rule: "oklch(86% 0.006 70)"
  accent: "#B89968"
  accent-primary: "#B89968"
  accent-strong: "oklch(58% 0.10 80)"
  accent-success: "#009244"
  accent-warn: "#C25F1F"
  accent-danger: "#BC0024"
  gain: "oklch(48% 0.10 145)"
  loss: "oklch(48% 0.13 25)"
  slice-1: "oklch(28% 0.008 60)"
  slice-2: "oklch(38% 0.008 60)"
  slice-3: "oklch(48% 0.008 60)"
  slice-4: "oklch(58% 0.008 60)"
  slice-5: "oklch(68% 0.008 60)"
  slice-6: "oklch(76% 0.007 65)"
  slice-7: "oklch(82% 0.007 70)"
  surface-dark: "oklch(14% 0.01 240)"
  surface-raised-dark: "oklch(18% 0.008 240)"
  surface-zebra-dark: "oklch(19% 0.008 240)"
  surface-hover-dark: "oklch(22% 0.008 240)"
  surface-expanded-dark: "oklch(16% 0.008 240)"
  ink-dark: "oklch(94% 0.005 75)"
  quiet-dark: "oklch(72% 0.01 60)"
  whisper-dark: "oklch(55% 0.01 60)"
  rule-dark: "oklch(28% 0.005 240)"
  accent-dark: "#D9B97A"
  accent-primary-dark: "#D9B97A"
  accent-strong-dark: "oklch(78% 0.12 80)"
  accent-success-dark: "#00DA5A"
  accent-warn-dark: "#EB7930"
  accent-danger-dark: "#D6002A"
  gain-dark: "oklch(62% 0.11 145)"
  loss-dark: "oklch(62% 0.13 25)"
  slice-1-dark: "oklch(85% 0.008 70)"
  slice-2-dark: "oklch(75% 0.008 65)"
  slice-3-dark: "oklch(65% 0.008 60)"
  slice-4-dark: "oklch(55% 0.008 60)"
  slice-5-dark: "oklch(45% 0.008 60)"
  slice-6-dark: "oklch(36% 0.008 60)"
  slice-7-dark: "oklch(28% 0.008 60)"
typography:
  display:
    fontFamily: "var(--font-plex-sans), 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
  display-serif:
    fontFamily: "var(--font-plex-serif), 'IBM Plex Serif', ui-serif, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: 1.2
  headline:
    fontFamily: "var(--font-plex-sans), 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "var(--font-plex-sans), 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "var(--font-plex-sans), 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "var(--font-plex-sans), 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.06em"
  numeric:
    fontFamily: "var(--font-plex-sans), 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "'tnum' 1"
  mono:
    fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
rounded:
  none: "0"
  sm: "2px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
components:
  row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "1rem 1rem"
  row-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  row-expanded:
    backgroundColor: "{colors.surface-expanded}"
    textColor: "{colors.ink}"
  drill-in:
    backgroundColor: "{colors.surface-expanded}"
    textColor: "{colors.ink}"
    padding: "1.5rem 1.5rem"
  nav-tab-active:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "0 0 0.25rem 0"
  nav-tab-inactive:
    textColor: "{colors.quiet}"
    typography: "{typography.label}"
    padding: "0 0 0.25rem 0"
  label-cap:
    textColor: "{colors.quiet}"
    typography: "{typography.label}"
  sortable-header:
    textColor: "{colors.whisper}"
    typography: "{typography.label}"
  sortable-header-active:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  textarea-notes:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  text-button:
    textColor: "{colors.quiet}"
    typography: "{typography.label}"
  text-button-hover:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  sws-card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "1.25rem 1.25rem"
  kpi-tile:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "1rem 1rem"
  kpi-delta-up:
    textColor: "{colors.accent-success}"
  kpi-delta-down:
    textColor: "{colors.accent-danger}"
  kpi-delta-flat:
    textColor: "{colors.quiet}"
  statement-card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "1rem 1rem"
  snowflake-fill:
    backgroundColor: "{colors.accent-primary}"
  comparison-gauge-marker:
    backgroundColor: "{colors.accent-primary}"
  comparison-gauge-track:
    backgroundColor: "{colors.surface-zebra}"
  portfolio-tab-active:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  portfolio-tab-inactive:
    textColor: "{colors.quiet}"
    typography: "{typography.label}"
  portfolio-tab-underline:
    backgroundColor: "{colors.accent-primary}"
---

# Design System: Quiet Ledger

## Overview: The Quiet Ledger

**Creative North Star: "The Quiet Ledger"**

The dashboard is a paper-and-ink ledger for a long-horizon investor, a place for sitting with positions, not reacting to them. Warm graphite type rests on cream in light mode; in dark mode (the v4 default) paper-cream ink rests on an SWS-style cool near-black. One rare gold accent carries interactive emphasis. Numbers are reported with the same typographic gravity at 0.2% as at 5%; the data does the talking, not the chrome. Mercury for restraint, Linear for craft, Notion for the canvas-as-page feel; these references combine into a surface that scales from a 15-second phone glance to a 30-minute weekend study session without changing voice.

Explicitly not a Bloomberg full-clone: no twenty-widget overwhelm, no blinking tickers, no metric for the sake of having one. Explicitly not Robinhood: no gotcha-green, no candy gradients, no confetti, no big-number-flex hero. Explicitly not the generic LLM SaaS dashboard either: no Inter on slate-blue with cards-nested-in-cards. The reading room rejects all three by construction.

The product surface is laid out as three top-level routes (`/`, `/portfolio`, `/watchlist`) sharing a single `max-w-6xl px-8 py-12` column and a single `NavBar` header: a lowercase masthead, a three-tab route strip in `pb-1 border-b border-ink` underline form, and a right-aligned pair of chrome toggles (`LocaleToggle` `EN`/`中` + `ThemeToggle` dark ↔ light). `/` and `/watchlist` stay thin; **`/portfolio` is itself split into six query-param tabs** (`?tab=holdings|returns|updates|dividends|analysis|calendar`, parsed server-side, default `holdings`) — the weekend-study surface where the SWS-faithful primitives live. Tokens are defined as CSS custom properties in `web/src/app/globals.css`; since v4 **dark is the default** (`defaultTheme="dark"`, `enableSystem={false}`), light applies under the `.dark` class being removed. Both modes are first-class.

> **Re-capture stamp (2026-06-04):** Colors + frontmatter were synced to v4 SWS on 2026-05-19; this pass brings the **Typography**, **Elevation**, and **Components** sections current with the same shipped v4 SWS surface — IBM Plex Serif display type, `rounded-xl` bordered SWS cards, the portfolio tab architecture, and the `snowflake` / `kpi-tile` / `statement-card` / `comparison-gauge` / `dividend-ledger` / `performance-chart-card` primitives are now documented. The machine-readable `DESIGN.json` sidecar still mirrors the v3 component CSS specimens and is the one remaining stale artifact (see `plan/v3-phase-e-followups.md`).

**Key Characteristics:**

- Paper-cream (light) / cool near-black (dark) surface, inverting ink, one rare SWS gold accent.
- One humanist sans family (IBM Plex Sans + Plex Mono) for the working surface; IBM Plex Serif reserved for display h1s + the dividend income hero. Tabular figures opt-in on numeric cells.
- Flat by default; depth from spacing, hairline borders, and tonal contrast within the warm-neutral family. v4 adds bordered `rounded-xl` SWS cards (`bg-surface-raised`) for the study-mode primitives — still shadowless.
- Two densities (glance, study) sharing one visual vocabulary; drill-in / portfolio-tab, not switch-of-surface, is how density scales.
- Color never carries meaning alone; gain/loss always paired with arrow + sign; statement sentiment always paired with a check/warn/neutral glyph.
- Charts that ship in SSR HTML are hand-rolled SVG (sparklines, donut, concentration stack, benchmark line, snowflake radar, dividend stacked bar); Recharts only inside lazy-mounted drill-ins + the performance-chart card.
- Restrained motion: state changes only; `prefers-reduced-motion: reduce` zeroes all transitions and animations globally.

## Colors: The Restrained Palette

> **v4 SWS rewrite (2026-05-19):** the accent moved from muted rust to a rare **SWS gold**, dark became the default surface (now a cool near-black, hue ~240), and a three-tone **status palette** (success / warn / danger) was added for chips and deltas. The chart strokes stayed muted forest / sienna. This section reflects the shipped v4 system; see *The Two-Tier Color Rule* below for how loud and quiet color now coexist.

Tinted neutrals carry the surface; one rare gold accent appears forcefully when it does. The chart layer stays deliberately quiet (muted forest / sienna); the status layer (chips, KPI deltas, statement-card icons) is allowed to be loud (SWS green / red).

### Primary

- **SWS Gold Accent** (`#B89968` light · `#D9B97A` dark, exposed as `--accent-primary`; `--accent` is an alias): the single shared accent. Used on the active nav-tab underline, focus rings, the tick-pulse halo, the snowflake pentagon fill/stroke, and the gold portfolio line in the benchmark chart. ≤10% of any screen. Replaces the v3 rust accent everywhere.
- **Accent Strong** (`oklch(58% 0.10 80)` light · `oklch(78% 0.12 80)` dark): focus-visible ring escalation only.

### Status palette (chips + deltas only — never chart strokes)

- **Success** (`#009244` light · `#00DA5A` dark, `--accent-success`): positive `↑` KPI deltas, `check` statement-card icons, the "undervalued" framing in valuation cards.
- **Warn** (`#C25F1F` light · `#EB7930` dark, `--accent-warn`): `warn` statement-card icons, "overvalued" framing.
- **Danger** (`#BC0024` light · `#D6002A` dark, `--accent-danger`): negative `↓` KPI deltas, low-score dividend chips.

These are intentionally brighter than the chart `gain`/`loss` tints. They live in small, bounded UI (a chip, a single delta number, a 7px icon), never in a chart stroke or a fill that occupies real estate. Each still pairs with a glyph or sign, so color is never the sole signal.

### Neutral

- **Paper Cream** surface (`oklch(96% 0.005 75)` light · `oklch(14% 0.01 240)` dark): the surface tint. Light is warm cream; dark is an SWS-style cool near-black (hue ~240) — the one place the dark theme departs from the warm-graphite family, to match the SWS reading-room feel.
- **Surface Raised** (`oklch(98% 0.004 75)` light · `oklch(18% 0.008 240)` dark): card lift — the notes textarea, KPI tiles, statement cards, snowflake card.
- **Surface Zebra** (`oklch(94.5% 0.006 75)` light · `oklch(19% 0.008 240)` dark): the subtle alternating-row tint on even rows of the holdings register. Reads as register pattern, not stripe; the alternation is the structural cue, not the color itself.
- **Surface Hover** (`oklch(93% 0.008 75)` light · `oklch(22% 0.008 240)` dark): the 2-3% shift applied to hovered rows. No shadow, no shift.
- **Surface Expanded** (`oklch(94% 0.008 75)` light · `oklch(16% 0.008 240)` dark): the drill-in fill when a row is open. Quieter than hover so the open state reads as anchored.
- **Ink** (`oklch(20% 0.008 60)` light · `oklch(94% 0.005 75)` dark): body and headings. Never `#000`, never `#fff`.
- **Quiet Ink** (`oklch(45% 0.008 60)` light · `oklch(72% 0.01 60)` dark): secondary text, axis labels, navigation rest state, label captions.
- **Whisper Ink** (`oklch(58% 0.007 65)` light · `oklch(55% 0.01 60)` dark): tertiary metadata, "since updated" stamps, save-state captions.
- **Rule** (`oklch(86% 0.006 70)` light · `oklch(28% 0.005 240)` dark): hairline borders between rows, sections, and around cards. Visible without shouting.

### Direction (chart strokes — paired, never sole signal)

- **Gain** (`oklch(48% 0.10 145)` light · `oklch(62% 0.11 145)` dark): muted forest. Sparkline + price-chart stroke for an up window. Always paired with `↑` arrow and `+` sign on the numeric.
- **Loss** (`oklch(48% 0.13 25)` light · `oklch(62% 0.13 25)` dark): muted sienna. Always paired with `↓` arrow and `−` sign.

The chart layer keeps these muted tints rather than the loud status green/red, so a wall of sparklines reads calm at a glance — principle #2, calm-under-volatility.

### Sequential graphite (charts)

`slice-1` through `slice-7` form a graphite ramp used by the donut, the concentration stacked bar, and the currency exposure stacked bar. Largest position renders darkest in light mode; the ramp **inverts in dark** (largest = lightest) so the largest position still reads heaviest against the near-black surface.

### Named Rules

**The Two-Tier Color Rule.** Color works in two registers. The **quiet tier** — muted forest `gain` / sienna `loss` and the graphite slice ramp — owns everything that occupies chart real estate (sparklines, price chart, donut, stacked bars). The **loud tier** — SWS green `success` / red `danger` / orange `warn` — is confined to small bounded UI: chips, single KPI deltas, statement-card icons. **Gold** is the single shared interactive accent across both. A chart never uses the loud tier; a chip never uses gold for up/down. This is what lets the surface read calm while still flagging a 0/6 dividend score in red.

**The OKLCH Doctrine (with v4 exception).** Surfaces, ink, rule, gain/loss, and slices are OKLCH in a narrow chroma band so neutrals belong to one family. The v4 accent + status tokens (`accent-primary`, `success`, `warn`, `danger`) ship as **hex**, matched from the SWS palette; this is the one sanctioned departure from the all-OKLCH doctrine.

**The One Voice Rule.** The gold accent is used on ≤10% of any screen. Its rarity is the message. Two accents on one view is one accent too many.

**The No-Sole-Signal Rule.** Up/down is never communicated by color alone — in either tier. Every up/down value carries an arrow (↑/↓), explicit sign (+/−), or positional cue; every statement-card sentiment carries a check/warn/neutral glyph. Color is reinforcement, never the signal. See `~/.claude/projects/-Users-tanlixuan-Me-Vault/memory/feedback_financial_framing.md` for the matching copy posture (no buy/sell/hold/target/recommend language anywhere in advisor surfaces).

**The Tinted-Neutral Rule.** Pure black and pure white are forbidden. Light neutrals tint warm (hue ~60-75); dark neutrals tint cool (hue ~240). Never `#000`, never `#fff`.

**The Dark-Mode Parity Rule.** Dark is the **default** since v4 (`defaultTheme="dark"`, `enableSystem={false}`). Every token has a paired dark value; the theme toggle is a 2-state dark ↔ light swap (the v3 `system → light → dark` cycle was retired with the dark-default flip).

## Typography: One Working Voice, One Display Voice

**Display & Body Font:** IBM Plex Sans, loaded via `next/font/google` with weights `300, 400, 500, 600`. Exposed as `--font-plex-sans` and consumed through `var(--font-sans)`. Carries the whole working surface — totals, tables, prose, label caps.

**Display Serif (v4):** IBM Plex Serif, loaded via `next/font/google` with weights `400, 500, 600`, `display: "swap"`. Exposed as `--font-plex-serif` and consumed through `var(--font-serif)` (Tailwind `font-serif`). Added in the v4 SWS rewrite and **deliberately rare**: it appears on exactly three things — the portfolio masthead h1 (`portfolio-heading.tsx`, `font-serif text-3xl font-medium`), the dividend income hero number (`dividends-view.tsx`, `font-serif text-4xl font-medium text-[var(--accent-primary)]`), and the small italic `ƒ` ex-dividend glyph in the holdings register + calendar (`font-serif italic`). Nowhere else. It is a serif accent for the one or two "this is the headline of the page" moments, matching the SWS editorial feel, not a body face.

**Mono Font:** IBM Plex Mono, loaded via `next/font/google` with weights `400, 500`. Exposed as `--font-plex-mono`. Reserved for inline code samples in the hero's empty-state hint, the macro-event ticker labels in the calendar (`font-mono uppercase`), and any future hash-style identifier.

**Character:** A single humanist sans carries the working surface — the same Plex Sans handles the 5xl USD total in the hero and the 11px label cap above each section, distinguished only by weight, size, and tracking. Plex Serif sits above it for display only: warm and editorial where the page wants a masthead, then it steps back out. Plex is warm enough to feel considered, restrained enough not to flag itself as a design choice.

### Hierarchy

- **Display** (Plex Sans, Light 300, `text-5xl` ≈ 3rem, `tracking-tight`, `tabular`): the USD total in the home + portfolio hero. One per page. Used sparingly.
- **Display Serif** (Plex Serif, Medium 500, `text-3xl` ≈ 1.875rem): the portfolio masthead h1. The `dividends` income hero reuses this role at `text-4xl` in `--accent-primary` gold. The only serif headings in the system.
- **Headline** (Plex Sans, Medium 500, `text-base` to `text-lg` ≈ 1rem to 1.125rem): section anchors when prose introduces a block. The dashboard rarely needs this; most sections lead with a label cap instead.
- **Title** (Plex Sans, Medium 500, `text-base` ≈ 1rem): card headings, ticker names in the holdings table, drill-in + tab subheaders, KPI-tile values lift to `text-2xl`.
- **Body** (Plex Sans, Regular 400, `text-sm` ≈ 0.875rem, line-height 1.55-1.65): default reading text. Insight prose, anomaly translations, position notes. Cap at 65-75ch where prose runs long.
- **Label cap** (Plex Sans, Medium 500, `text-xs` ≈ 0.75rem, tracking `0.06em`, uppercase, `text-quiet`): the recurring `Portfolio` / `Holdings` / `Watchlist` / `Last 90 days` / `What this means` chrome, plus KPI-tile + statement-card labels (tracking widens to `0.08em` on some tiles). The single most-used type role in the system.
- **Numeric** (Plex Sans, Regular 400 with `.tabular` class applying `font-feature-settings: 'tnum' 1`): every number that lives in a column or a KPI tile. Body has tabular off by default; numeric cells opt in. Document this, it is non-obvious.
- **Mono** (Plex Mono, Regular 400, `text-xs` to `text-sm`): inline `<code>` and macro-event ticker labels in the calendar. Numbers do not switch to mono; tabular figures handle alignment.

### Named Rules

**The Sans-Working, Serif-Display Rule (v4).** The working surface is one humanist sans (IBM Plex Sans), with Plex Mono for inline code. IBM Plex Serif is the **only** sanctioned second family, and only for display: the portfolio masthead h1, the dividend income hero, and the `ƒ` ex-div glyph. This replaces the v3 "One Family Rule." A serif heading anywhere outside those three roles, or a serif paragraph anywhere, is a regression. No third family, no display specimen fonts, no specimen flexing.

**The Tabular-Numbers Rule.** All numeric data uses tabular figures. Always. Body text keeps tabular off so prose reads naturally; the `.tabular` class is opt-in on every numeric cell, header, and data caption. A column of prices that does not align vertically is a bug.

**The Same-Gravity Rule.** A 0.2% move and a 5% move share the same typographic treatment. Magnitude is read from the digits, not from size. The hero's signed P&L reuses `text-sm`, not a scaled-up display.

**The Lowercase-Chrome Rule.** Navigation tabs (`home`, `portfolio`, `watchlist`) and chrome labels (`theme`, `quiet ledger` masthead) render lowercase, not Title Case. The label cap above each block is the only uppercase element in the system, and uses tracking `0.06em` so it reads as chrome rather than shouting.

## Elevation: Flat by Default

The system is flat. Depth comes from spacing, hairline rules, and tonal contrast within the warm-neutral family, not shadows. A panel sits on the surface because of its margin and its border, not because it floats.

**The v4 SWS card.** v4 introduced a genuine card primitive for the study-mode portfolio tabs: `bg-surface-raised border border-rule rounded-xl` with `p-4`/`p-5`/`p-6` padding (snowflake card, KPI tile, statement card, comparison gauge, dividend-forecast switcher, performance-chart card). This is a real container, not a section divider — but it stays inside the elevation doctrine because it carries **no shadow and no z-axis lift**. Depth still reads from the `surface` → `surface-raised` tonal step and the hairline `border-rule`, never from a drop-shadow. Rounded corners (`rounded-xl` = 12px; `rounded-full` for chips, snowflake dots, and gauge markers) are the one visual concession to the SWS look; the v3 `rounded-sm` 2px still applies to the notes textarea and drill-in inner frames.

State changes happen in color and weight, not in z-axis. Hovering a holdings row darkens it from `surface` to `surface-hover` with a `transition-colors` only, no transform. Expanding a row shifts it to `surface-expanded` and reveals a drill-in panel inset by `border-t border-rule`, again with no shadow.

The single global motion guarantee is `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }`. Default transitions are color-only, ≤200ms, and never animate layout properties.

### Named Rules

**The Flat-By-Default Rule.** Surfaces have no shadow at rest. If a hover state ever introduces shadow, it is hairline (`0 1px 0` ambient at most) and reserved for genuinely interactive elements; never decorative cards.

**The No-Floating-Cards Rule.** Cards are allowed (v4 added bordered `rounded-xl` SWS cards for the portfolio study tabs) but they never *float*: no shadow, no z-lift, no blur backdrop. The glance surfaces (`/`, `/watchlist`, the holdings register) still default to sections divided by spacing and a hairline `border-b border-rule`, not a card grid. A card earns its border by holding a self-contained SWS primitive (snowflake, KPI strip, gauge cluster); it does not become the wrapper-of-everything. The drill-in remains full-bleed within the table row it expands from rather than a floating tile.

**The Color-Only Transitions Rule.** Transitions animate color and opacity. Never `transform`, never layout properties. Numbers do not animate in or out; they update.

## Components

The component vocabulary is small on purpose. There is no buttons-cards-inputs library here; the surfaces are mostly tables, captions, and one textarea. Each entry below names where the primitive lives in `web/src/components/`.

### Section caption (`label-cap`)

Every block opens with the same caption: `text-xs uppercase tracking-[0.06em] text-quiet mb-3`. Used in `hero.tsx` (`Portfolio`), `holdings-table.tsx` (`Holdings`), `drill-in.tsx` (`Last 90 days`, `What this means`, `Notes`), `daily-digest.tsx`, `foresight-block.tsx`, `concentration-block.tsx`, `benchmark-block.tsx`, `watchlist-table.tsx`. The recurrence is the affordance: the same gesture means "section starts here."

### Hero (`hero.tsx`)

The home route leads with this hero section: `border-b border-rule pb-10 mb-10`, `flex flex-col md:flex-row` so the donut wraps under the totals on narrow viewports. Display number left, allocation donut right. No card. No shadow. The only "huge number" in the system is the USD total, in `text-5xl font-light`. The portfolio route opens differently since v4 — see *Portfolio hero (holdings tab)* below — but reuses the same `text-5xl` display total inside its performance card.

### Portfolio hero (holdings tab — `performance-chart-card.tsx` + `portfolio-snowflake-card.tsx`)

The portfolio `holdings` tab leads with a two-column grid (`lg:grid-cols-[2fr_1fr]`): a **performance card** (2/3) beside a **snowflake card** (1/3), with the masthead `portfolio-heading` h1 (serif) above and the `holdings-kpi-strip` + register below. This replaces the v3 "donut hero on every route" — the donut now lives only on the home hero; the portfolio's at-a-glance signal is the SWS snowflake instead.

### Tables (`holdings-table.tsx`, `watchlist-table.tsx`)

`holdings-table.tsx` ships as a **register row primitive** (2026-05-13). The table reads as a paper register rather than a generic data table: alternating zebra tint, tighter row rhythm, a structural left-margin glyph column. `watchlist-table.tsx` retains the older shape pending session-2 parity.

- **Shape:** `w-full border-collapse`. No outer border. Section divider only at the top and bottom edges via `border-b border-rule`.
- **Header row:** `border-b border-rule`. First column is the empty glyph margin (`w-6`, `aria-hidden`); remaining columns left-aligned for text and right-aligned for numbers and trend.
- **Body rows:** `border-b border-rule`, `py-3` (~25% tighter than the prior `py-4`). Even rows tint to `bg-surface-zebra` (~1.5% delta from surface) via the `even:` Tailwind variant. Hover darkens to `bg-surface-hover`; expanded row sits at `bg-surface-expanded`. Hover and expanded both override the zebra base because they emit later in the cascade.
- **Glyph margin column:** dedicated leftmost `<td>` (`w-6`, `pl-1 pr-2`), always present even when no glyph applies, so the register's left margin remains a structural element. Stacks the earnings icon (`⊙` SVG calendar) and the ex-dividend mark (`ƒ` serif italic) vertically inside the cell when both apply.
- **Numeric column weight:** every numeric cell uses `font-medium` (500) + `tabular`. Secondary captions inside the same cell (FX equivalent, signed $ change) drop back to `font-normal` and `text-whisper` so the primary figure carries the row.
- **Sortable header:** `<button>` rendering label + `↑` / `↓` indicator when active. `text-whisper` rest, `text-ink` active, hover lifts to `text-ink`. Sort state persists in localStorage (`ql.holdings.sort`). The glyph margin column is non-sortable by design.
- **Row trigger:** the whole row is the affordance (`role="button"`, `tabIndex={0}`, Enter / Space toggle). `aria-expanded` mirrors state.

### Drill-in (`drill-in.tsx`)

The closest thing to a card in the system, and even it does not float. `bg-surface-expanded border-t border-rule px-6 py-6`, full-bleed inside the table row that expanded it. Internal grid `lg:grid-cols-[1fr_360px]` with the price chart left and a stacked column of insight + notes + anomalies right. Used identically by holdings and watchlist tables.

### Notes textarea (`notes-block.tsx`)

`bg-surface-raised border border-rule rounded-sm px-3 py-2`. Focus state shifts the border to `border-accent` (the SWS gold since v4, no longer the v3 rust); no glow, no ring escalation in the current build (a `focus-visible:ring` would be a future accessibility-only refinement). Save-state caption sits below in `text-xs text-whisper` and reports `saving…`, `Last saved · 30s ago`, or an inline error in `text-loss`. Empty placeholder is italic `text-whisper`: "Thesis, triggers, risks…"

### Navigation tabs (`nav-bar.tsx`)

`text-xs` lowercase tabs in a `flex items-baseline gap-5` strip with a `pb-1 border-b` underline. Active tab: `text-ink border-ink`. Inactive tab: `text-quiet border-transparent` with `hover:text-ink`. Masthead `quiet ledger` sits to the left in `text-sm font-medium tracking-wide text-quiet`. Single header row, `mb-12`.

### Theme toggle (`theme-toggle.tsx`)

A text button, no icon. Since v4 it is a 2-state swap: `dark` ↔ `light` (the v3 `system → light → dark → system` cycle was retired with the dark-default flip and `enableSystem={false}`). Renders the current label in `text-xs uppercase tracking-wider text-quiet`; hover lifts to `text-ink`. No animation on theme change beyond the global `transition-colors`.

### Sparkline (`sparkline.tsx`)

Hand-rolled SVG path, 96×28 viewBox, `strokeWidth=1.25`, `strokeLinecap="round"`. Stroke color is `var(--gain)`, `var(--loss)`, or `var(--quiet)` depending on direction over the 30-day window. SSR-renderable so the table paints in one pass without Recharts' SSR measurement issues.

### Donut (`donut.tsx`)

Hand-rolled SVG paths in the hero, 210px default size. Slices use the `slice-1` to `slice-7` graphite ramp; labels render on the slice rather than in a hover-only tooltip (a v2 papercut, fixed in v3).

### Stacked bars (`concentration-block.tsx`)

Hand-rolled SVG horizontal stacked bars for top-N share and currency exposure. Same graphite ramp as the donut. No traffic-light coloring; concentration "shape" is observational only.

### Line chart (`benchmark-chart.tsx`)

Hand-rolled SVG line chart for portfolio vs benchmark, with a tabular-figure legend below. 30D / 90D / 1Y window toggle in `text-xs uppercase` text buttons. Since v4 the portfolio line is drawn in **gold** (`var(--accent-primary)`, `strokeWidth` 1.75) over gray benchmark strokes (`var(--quiet)`), matching the SWS portfolio chart; direction tints are not used here because relative path is the message.

### Price chart (`price-chart.tsx`)

The single Recharts surface in the system. Lazy-mounted inside the drill-in (so SSR never tries to measure it), 90-day daily close. Direction tint inherited from the row's total return.

### Skeletons (`insight-block.tsx` loading state, etc.)

`bg-rule/40 animate-pulse` placeholder bars in a two-line grid, holding the same `[5rem_1fr]` shape the resolved insight uses. Skeleton over spinner; shape over motion.

### Calendar mark (inline SVG in `holdings-table.tsx`)

12px outlined-stroke calendar glyph next to a ticker name when earnings is within 14 days. `currentColor` so it follows theme. Title attribute carries `Earnings May 13 · in 8 days` for hover; `aria-label` mirrors. No badge, no pill, no dot. The glyph itself is the cue.

### Locale toggle (`locale-toggle.tsx`)

A text button beside the theme toggle in the nav: renders `EN` / `中` in `text-xs uppercase tracking-wider text-quiet`, hover lifts to `text-ink`. Two-state swap, mirrors the theme-toggle's chrome. Client-only locale (no cookie); renders the `EN` default until mount to keep SSR HTML stable. See `project_i18n_architecture` memory.

### Portfolio tab nav (`portfolio-tab-nav.tsx`)

The six-tab strip on `/portfolio` (`holdings` / `returns` / `updates` / `dividends` / `analysis` / `calendar`). `flex gap-1 mb-6 border-b border-rule`; each tab is a prefetching `<Link href="?tab=…">` in `relative px-3 py-2 text-sm transition-colors`. Active: `text-ink font-medium` with an absolute gold underline (`absolute left-2 right-2 -bottom-px h-0.5 bg-[var(--accent-primary)]`) — note the underline is **gold here**, distinct from the top-level `NavBar`'s ink underline. Inactive: `text-quiet hover:text-ink`. Tab state is the URL query param, parsed server-side, so each tab is shareable and SSR's its own content.

### Analysis sub-tabs (`analysis-sub-tabs.tsx`)

A nested second-level tab strip inside the `analysis` tab (Valuation / Future / Past / Health / Dividend — the five snowflake axes). `flex items-baseline gap-5 border-b border-rule`; active `text-ink` with the same absolute gold underline, inactive `text-quiet hover:text-ink`, each `relative text-sm font-medium py-2`. Unlike the route-level tabs this is **client state** (not URL): only Valuation renders live data today; the other four show dashed-border placeholder cards.

### Snowflake (`snowflake.tsx`)

Hand-rolled SVG 5-axis radar (the SWS signature), `130×120` viewBox, three sizes (28px mini in the holdings register, 96px strip, 240px card). Axes counter-clockwise from top: Value · Future · Past · Health · Dividend. Six concentric rings + spokes in `var(--rule)`; data polygon stroked + dotted in `var(--accent-primary)` gold with a `color-mix(in oklch, var(--accent-primary) 28%, transparent)` fill; null axes render a dashed spoke + dashed outline in `var(--quiet)` (a structural signal, not a color one); axis labels in `var(--quiet)`. No delta glyph — the polygon shape *is* the read. SSR-renderable.

### Snowflake card / statements (`snowflake-card.tsx`, `portfolio-snowflake-card.tsx`, `snowflake-statements.tsx`)

`snowflake-card` wraps the 240px snowflake in an SWS card (`bg-surface-raised border border-rule rounded-xl p-5 flex flex-col gap-4`) with a heading, optional summary, and two footer chips: a **risks** chip (`●` glyph, `text-[var(--accent-danger)]` on an 18%-mix danger tint) and a **rewards** chip (`★` glyph, `text-[var(--accent-success)]` on a success tint). `snowflake-statements` lays the 240px snowflake beside a `md:grid-cols-2` grid of statement cards (`grid-cols-1 lg:grid-cols-[240px_1fr] gap-8`) with a per-axis score chip (`rounded-full border-rule`).

### Statement card (`statement-card.tsx`)

Small SWS tile: a 7×7px `rounded-full border` icon badge + headline + optional subtext, `bg-surface-raised border border-rule rounded-xl p-4 flex gap-3 items-start`. The badge glyph is the sentiment signal — hand-rolled SVG check (✓) on an `--accent-success` 18%-mix tint, warn (⚠) on `--accent-warn`, or hollow neutral (◯) on `border-rule`. The glyph carries the meaning; color only reinforces it (no-sole-signal). This is the loud-tier status palette's main home.

### KPI tile / strip (`kpi-tile.tsx`, `kpi-strip.tsx`, `holdings-kpi-strip.tsx`)

`kpi-tile` is a single-metric SWS card: uppercase label (`text-quiet`, tracking `0.08em`) + `text-2xl font-medium tabular text-ink` value + an optional delta row. The delta pairs a glyph with a status color: `↑` + `text-[var(--accent-success)]` (pos), `↓` + `text-[var(--accent-danger)]` (neg), `·` + `text-quiet` (flat), with the percent in `text-quiet`. `kpi-strip` is a `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3` of four tiles (Unrealized · Realized · Dividends · Currency impact) + an italic `text-[11px] text-whisper` caption. `holdings-kpi-strip` is the client wrapper that i18n's labels and degrades to `—` when the backend is unreachable.

### Comparison gauge (`comparison-gauge.tsx`)

A horizontal valuation gauge in an SWS card (`rounded-xl border-rule bg-surface-raised p-5`). A `h-1 rounded-full bg-[var(--surface-zebra)]` track with 5 tick labels (0–100%, `text-quiet tabular`); a gold portfolio marker (`bg-[var(--accent-primary)]` dot, `border-2 border-surface-raised`) and a quiet reference line (`bg-quiet`); out-of-range values show a gold `+`/`−` overflow caret. A two-row table below gives the portfolio value (`text-ink tabular font-medium`) vs reference (`text-quiet tabular`). Position + glyph + color all carry the signal. Used for PE / PS / PEG in the analysis Valuation sub-tab.

### Dividend ledger block (`dividend-ledger-block.tsx`)

Multi-section block (`my-12`): heading + summary (TTM total + next ex-date) + a hand-rolled SVG horizontal stacked bar (`600×16` viewBox, segments fill `var(--slice-1…6)` with `stroke=var(--surface)` separators) + a per-ticker legend + an expandable holdings table + a lazy [learn more] insight panel (`bg-surface-raised border-rule rounded-sm p-4`). Same graphite slice ramp as the donut — chart layer stays quiet-tier.

### Dividends forecast switcher (`dividends-forecast-switcher.tsx`)

SWS card (`bg-surface-raised border-rule rounded-xl p-6`) with a 12m / 24m / 36m horizon toggle (`text-xs uppercase tracking-[0.06em]`; active tab `border-b border-[var(--accent-primary)] text-ink`) + summary line + a per-ticker table (Payment · Yield · YoC · Score · Growth). The Score cell is the loud tier: `≤2` danger, `≤4` warn, `>4` success, always shown as `n/6` so the number carries the signal alongside the color.

### Performance chart card (`performance-chart-card.tsx`)

The portfolio `holdings` hero's left card (`bg-surface-raised border-rule rounded-xl p-5`). Holds a Value-Over-Time / Perf-vs-Market sub-toggle + a range strip (1M / 3M / 1Y, others disabled `text-whisper cursor-not-allowed`), a four-metric tile row (Total Value · Total Returns · 1D · IRR stub), and the hand-rolled-SVG `benchmark-chart` with a legend whose dots are gold portfolio (`var(--accent-primary)`) vs quiet benchmark (`var(--quiet)`). Tab groups sit in `bg-surface-zebra p-1 rounded-lg` pill containers, active pill `bg-surface text-ink`.

### Returns view (`returns-view.tsx`, `returns-csv-button.tsx`)

The `returns` tab: a breakdown stacked bar (unrealized + realized + dividends + currency) over a five-tile KPI grid, a highest/lowest-5 contributors row, and a scrollable 13-column detail table with a client-side CSV export button. Fails to a centered dashed-border `border-rule` "unavailable" card if the summary/detail fetch fails — the standard tab empty-state.

### Calendar view (`calendar-view.tsx`)

The `calendar` tab: a `grid-cols-7` 42-cell month grid (`?month=YYYY-MM` query param). Each cell carries the day number, an optional `TODAY` badge (today's cell gets `ring-1 ring-rule ring-inset`), the day's signed P&L, and up to four event chips with a `+N more` overflow; out-of-month cells dim to `opacity-60 text-whisper`. Event kinds read by glyph: earnings (calendar glyph + ticker), macro (`font-mono uppercase`), ex-div (serif `ƒ` + ticker), company event (bullet + label). Selecting an event opens a bottom panel (`border-t border-rule`) with a lazy `foresight-insight-body` What/Meaning/Watch trio; ESC clears.

### Named Rules

**The Hand-Rolled-SVG Rule.** Charts that ship in SSR HTML are hand-rolled SVG (sparkline, donut, concentration stack, currency stack, benchmark line, **snowflake radar**, **dividend stacked bar**, comparison-gauge track). `price-chart.tsx` (the 90-day drill-in price chart) remains the **only** Recharts surface in the system, lazy-mounted where SSR measurement is not a concern. The v4 `performance-chart-card` embeds the hand-rolled `benchmark-chart`, not Recharts, so it stays SSR-safe. This is captured in `CLAUDE.md §Conventions`; preserve it.

**The Same-Caption Rule.** Every block opens with the `text-xs uppercase tracking-[0.06em] text-quiet` caption. Recurrence is the affordance.

**The Drill-In-Not-Modal Rule.** A row's depth is reached by expanding inline, not by opening a modal or navigating to a sub-page. The two reading modes (glance, study) share one surface; you scale density by drilling in.

## Do's and Don'ts

### Do:

- **Do** keep the accent under 10% of any screen. Its rarity is the point.
- **Do** pair every gain/loss color with an arrow and explicit sign. Color is reinforcement, never the signal.
- **Do** add the `.tabular` class to every numeric cell, header, and caption. Body text stays non-tabular.
- **Do** tint every neutral toward the warm surface family. Chroma `0.005-0.01`. No `#000`. No `#fff`.
- **Do** treat a 5% move and a 0.2% move with the same typographic gravity.
- **Do** scale glance-density to study-density by drilling in, not by switching to a different layout.
- **Do** keep prose at 65-75ch line length where prose runs long.
- **Do** reach for full borders or background tint when separation is needed.
- **Do** ship hand-rolled SVG for any chart that lives in SSR HTML; reserve Recharts for lazy-mounted drill-ins.
- **Do** open every block with the `text-xs uppercase tracking-[0.06em] text-quiet` caption. The recurrence is the affordance.
- **Do** keep advisor copy plain-English: never buy, sell, hold, trim, add, target, forecast, predict, recommend, "you should", rally, surge, soar, crash. See `feedback_financial_framing.md`.

### Don't:

- **Don't** become a Bloomberg / MarketWatch full-clone. Twenty widgets, blinking tickers, every metric possible: the opposite of "quiet enough to think in."
- **Don't** use the crypto neon-on-black hype look. Hot pink / cyan on near-black, glow effects, "to the moon" energy.
- **Don't** become Robinhood. No gotcha-green, no candy gradients, no confetti, no big-number-flex hero. Investing is not Candy Crush.
- **Don't** ship the generic LLM-default SaaS dashboard. No Inter, no slate-blue, no cards-nested-in-cards, no 12px-padding-everywhere. That aesthetic signals "AI made that."
- **Don't** use `border-left` greater than 1px as a colored accent stripe on cards or alerts. Side-stripe borders are forbidden.
- **Don't** apply `background-clip: text` with a gradient. Use a single solid color, with emphasis through weight.
- **Don't** apply `backdrop-filter: blur` decoratively. No glassmorphism unless it is purposeful and rare.
- **Don't** give the v4 `rounded-xl` SWS cards a `box-shadow`, hover-lift, or z-translate. They earn depth from the `surface-raised` tonal step + `border-rule` hairline only. A floating card is a regression.
- **Don't** build a hero-metric template (huge number, small label, supporting stats, gradient accent). The classic SaaS cliché is exactly the urgency theater this dashboard rejects.
- **Don't** repeat identical card grids. Same-sized cards with icon + heading + text endlessly is a layout failure.
- **Don't** reach for a modal as the first thought. Exhaust inline and progressive (drill-in) alternatives first.
- **Don't** animate prices in or out. Numbers updating is the data doing its job, not a moment that needs choreography.
- **Don't** animate transform or layout. Color and opacity only, ≤200ms.
- **Don't** use bounce or elastic easing. Ease out with exponential curves (ease-out-quart / quint / expo).
- **Don't** use em dashes in copy. Use commas, colons, semicolons, periods, or parentheses.
- **Don't** introduce a second sans family, or use IBM Plex Serif beyond its three display roles (portfolio h1, dividend income hero, `ƒ` ex-div glyph). Plex Sans is the working voice, Plex Mono is for inline code + macro tickers, Plex Serif is a rare display accent. No fourth family, no serif paragraphs.

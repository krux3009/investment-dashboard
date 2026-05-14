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
  accent: "oklch(55% 0.12 28)"
  accent-strong: "oklch(60% 0.13 28)"
  gain: "oklch(48% 0.10 145)"
  loss: "oklch(48% 0.13 25)"
  slice-1: "oklch(28% 0.008 60)"
  slice-2: "oklch(38% 0.008 60)"
  slice-3: "oklch(48% 0.008 60)"
  slice-4: "oklch(58% 0.008 60)"
  slice-5: "oklch(68% 0.008 60)"
  slice-6: "oklch(76% 0.007 65)"
  slice-7: "oklch(82% 0.007 70)"
  surface-dark: "oklch(18% 0.008 60)"
  surface-raised-dark: "oklch(22% 0.008 60)"
  surface-zebra-dark: "oklch(21.5% 0.008 60)"
  surface-hover-dark: "oklch(24% 0.008 60)"
  surface-expanded-dark: "oklch(26% 0.008 60)"
  ink-dark: "oklch(92% 0.005 75)"
  quiet-dark: "oklch(70% 0.008 60)"
  whisper-dark: "oklch(58% 0.008 60)"
  rule-dark: "oklch(30% 0.008 60)"
  accent-dark: "oklch(68% 0.12 28)"
  accent-strong-dark: "oklch(72% 0.13 28)"
  gain-dark: "oklch(62% 0.11 145)"
  loss-dark: "oklch(62% 0.13 25)"
typography:
  display:
    fontFamily: "var(--font-plex-sans), 'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
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
---

# Design System: Quiet Ledger

## Overview: The Quiet Ledger

**Creative North Star: "The Quiet Ledger"**

The dashboard is a paper-and-ink ledger for a long-horizon investor, a place for sitting with positions, not reacting to them. Warm graphite type rests on cream in light mode; in dark mode the same family inverts to paper-cream ink on a warm-graphite surface. The accent is rare on purpose. Numbers are reported with the same typographic gravity at 0.2% as at 5%; the data does the talking, not the chrome. Mercury for restraint, Linear for craft, Notion for the canvas-as-page feel; these references combine into a surface that scales from a 15-second phone glance to a 30-minute weekend study session without changing voice.

Explicitly not a Bloomberg full-clone: no twenty-widget overwhelm, no blinking tickers, no metric for the sake of having one. Explicitly not Robinhood: no gotcha-green, no candy gradients, no confetti, no big-number-flex hero. Explicitly not the generic LLM SaaS dashboard either: no Inter on slate-blue with cards-nested-in-cards. The reading room rejects all three by construction.

The product surface is laid out as three thin server-component routes (`/`, `/portfolio`, `/watchlist`) sharing a single `max-w-6xl` column, a `NavBar` tab strip in `pb-1 border-b` underline form, and a `theme-toggle` that cycles `system → light → dark → system`. Tokens are defined as CSS custom properties in `web/src/app/globals.css`; light is the default, dark inverts under the `.dark` class. Both modes are first-class.

**Key Characteristics:**

- Paper-cream surface, warm-graphite ink, one rare rust accent.
- One humanist sans family (IBM Plex Sans + Plex Mono), tabular figures opt-in on numeric cells.
- Flat by default; depth from spacing, hairline borders, and tonal contrast within the warm-neutral family.
- Two densities (glance, study) sharing one visual vocabulary; drill-in not switch-of-surface is how density scales.
- Color never carries meaning alone; gain/loss always paired with arrow + sign.
- Charts that ship in SSR HTML are hand-rolled SVG (sparklines, donut, concentration stack, benchmark line); Recharts only inside lazy-mounted drill-ins.
- Restrained motion: state changes only; `prefers-reduced-motion: reduce` zeroes all transitions and animations globally.

## Colors: The Restrained Palette

Tinted neutrals carry the surface; one warm rust accent appears rarely and forcefully when it does. Both themes ship from the same chroma vocabulary, only the lightness inverts.

### Primary

- **Muted Rust Accent** (`oklch(55% 0.12 28)` light · `oklch(68% 0.12 28)` dark): used only on focus rings, the textarea focus border, and any future single-element interactive emphasis. Never green. Never red. Never gold.
- **Accent Strong** (`oklch(60% 0.13 28)` light · `oklch(72% 0.13 28)` dark): focus-visible ring escalation only.

### Neutral

- **Paper Cream** surface (`oklch(96% 0.005 75)` light · `oklch(18% 0.008 60)` dark): the surface tint. Warm enough to reject the white-paper SaaS reflex; in dark mode it becomes a warm graphite that visibly belongs to the same family.
- **Surface Raised** (`oklch(98% 0.004 75)` light · `oklch(22% 0.008 60)` dark): the textarea fill in the notes block. The only place a panel "lifts" tonally.
- **Surface Zebra** (`oklch(94.5% 0.006 75)` light · `oklch(20.5% 0.008 60)` dark): the subtle alternating-row tint applied to even rows of the holdings register. ~1.5% delta from `surface` in both modes. Reads as register pattern, not stripe; the alternation is the structural cue, not the color itself.
- **Surface Hover** (`oklch(93% 0.008 75)` light · `oklch(24% 0.008 60)` dark): the 2-3% darken applied to hovered rows in the holdings + watchlist tables. No shadow, no shift.
- **Surface Expanded** (`oklch(94% 0.008 75)` light · `oklch(26% 0.008 60)` dark): the drill-in fill when a row is open. A degree quieter than hover so the open state reads as anchored.
- **Warm Graphite Ink** (`oklch(20% 0.008 60)` light · `oklch(92% 0.005 75)` dark): body and headings. Tinted toward the surface family; never `#000` and never `#fff`.
- **Quiet Ink** (`oklch(45% 0.008 60)` light · `oklch(70% 0.008 60)` dark): secondary text, axis labels, navigation rest state, label captions.
- **Whisper Ink** (`oklch(58% 0.007 65)` light · `oklch(58% 0.008 60)` dark): tertiary metadata, "since updated" stamps, save-state captions.
- **Rule** (`oklch(86% 0.006 70)` light · `oklch(30% 0.008 60)` dark): hairline borders between table rows, between sections, around the textarea. Visible without shouting.

### Direction (paired, never sole signal)

- **Gain** (`oklch(48% 0.10 145)` light · `oklch(62% 0.11 145)` dark): muted forest. Always paired with `↑` arrow and `+` sign.
- **Loss** (`oklch(48% 0.13 25)` light · `oklch(62% 0.13 25)` dark): muted sienna. Always paired with `↓` arrow and `−` sign.

### Sequential graphite (charts)

`slice-1` through `slice-7` form a graphite ramp used by the donut, the concentration stacked bar, the currency exposure stacked bar, and any future ordinal series. Largest position renders darkest in light mode; the ramp inverts in dark so largest still reads heaviest.

### Named Rules

**The OKLCH Doctrine.** Every color in the system is OKLCH, even where it triggers a Stitch linter warning on the frontmatter. The surface family lives in a narrow chroma band (`0.005-0.013`) so neutrals visibly belong to the warm cream rather than drift into cool gray.

**The One Voice Rule.** The accent is used on ≤10% of any screen. Its rarity is the message. Two accents on one view is one accent too many.

**The No-Green-On-Red Rule.** Gain and loss are never communicated by color alone. Every up/down value carries an arrow (↑/↓), explicit sign (+/−), or positional cue. Color is reinforcement, never the signal. See `~/.claude/projects/-Users-tanlixuan-Me-Vault/memory/feedback_financial_framing.md` for the matching copy posture (no buy/sell/hold/target/recommend language anywhere in advisor surfaces).

**The Tinted-Neutral Rule.** Pure black and pure white are forbidden. Every neutral is tinted toward the warm surface family with chroma `0.005-0.01`. The graphite must visibly belong to the cream, in either mode.

**The Dark-Mode Parity Rule.** Dark is not a reskin and not an afterthought. Every token has a paired dark value, every component reads on both surfaces, and the theme toggle cycles `system → light → dark → system` so ambient context, not category reflex, picks the mode.

## Typography: One Voice

**Display & Body Font:** IBM Plex Sans, loaded via `next/font/google` with weights `300, 400, 500, 600`. Exposed as `--font-plex-sans` and consumed through `var(--font-sans)`.

**Mono Font:** IBM Plex Mono, loaded via `next/font/google` with weights `400, 500`. Exposed as `--font-plex-mono`. Reserved for inline code samples in the hero's empty-state hint and any future hash-style identifier.

**Character:** A single humanist family carries the whole system. The same family handles the 5xl USD total in the hero and the 11px label cap above each section, distinguished only by weight, size, and tracking. Plex is warm enough to feel considered, restrained enough not to flag itself as a design choice.

### Hierarchy

- **Display** (Light 300, `text-5xl` ≈ 3rem, `tracking-tight`, `tabular`): the USD total in the hero. One per page. Used sparingly.
- **Headline** (Medium 500, `text-base` to `text-lg` ≈ 1rem to 1.125rem): section anchors when prose introduces a block. The dashboard rarely needs this; most sections lead with a label cap instead.
- **Title** (Medium 500, `text-base` ≈ 1rem): card headings, ticker names in the holdings table, drill-in subheaders.
- **Body** (Regular 400, `text-sm` ≈ 0.875rem, line-height 1.55-1.65): default reading text. Insight prose, anomaly translations, position notes. Cap at 65-75ch where prose runs long.
- **Label cap** (Medium 500, `text-xs` ≈ 0.75rem, tracking `0.06em`, uppercase, `text-quiet`): the recurring `Portfolio` / `Holdings` / `Watchlist` / `Last 90 days` / `What this means` chrome. The single most-used type role in the system.
- **Numeric** (Regular 400 with `.tabular` class applying `font-feature-settings: 'tnum' 1`): every number that lives in a column. Body has tabular off by default; numeric cells opt in. Document this, it is non-obvious.
- **Mono** (Regular 400, `text-xs` to `text-sm`): inline `<code>` only. Numbers do not switch to mono; tabular figures handle alignment.

### Named Rules

**The One Family Rule.** Every glyph in the interface comes from IBM Plex Sans (or Plex Mono for inline code) at varying weights. No serif/sans pairing, no display fonts, no specimen flexing.

**The Tabular-Numbers Rule.** All numeric data uses tabular figures. Always. Body text keeps tabular off so prose reads naturally; the `.tabular` class is opt-in on every numeric cell, header, and data caption. A column of prices that does not align vertically is a bug.

**The Same-Gravity Rule.** A 0.2% move and a 5% move share the same typographic treatment. Magnitude is read from the digits, not from size. The hero's signed P&L reuses `text-sm`, not a scaled-up display.

**The Lowercase-Chrome Rule.** Navigation tabs (`home`, `portfolio`, `watchlist`) and chrome labels (`theme`, `quiet ledger` masthead) render lowercase, not Title Case. The label cap above each block is the only uppercase element in the system, and uses tracking `0.06em` so it reads as chrome rather than shouting.

## Elevation: Flat by Default

The system is flat. Depth comes from spacing, hairline rules, and tonal contrast within the warm-neutral family, not shadows. A panel sits on the surface because of its margin and its border, not because it floats.

State changes happen in color and weight, not in z-axis. Hovering a holdings row darkens it from `surface` to `surface-hover` with a `transition-colors` only, no transform. Expanding a row shifts it to `surface-expanded` and reveals a drill-in panel inset by `border-t border-rule`, again with no shadow.

The single global motion guarantee is `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }`. Default transitions are color-only, ≤200ms, and never animate layout properties.

### Named Rules

**The Flat-By-Default Rule.** Surfaces have no shadow at rest. If a hover state ever introduces shadow, it is hairline (`0 1px 0` ambient at most) and reserved for genuinely interactive elements; never decorative cards.

**The No-Floating-Cards Rule.** Cards are not the default container. Most things are sections divided by spacing and a hairline `border-b border-rule`. The drill-in is the closest thing to a card in the system, and it is full-bleed within the table row it expands from rather than a floating tile.

**The Color-Only Transitions Rule.** Transitions animate color and opacity. Never `transform`, never layout properties. Numbers do not animate in or out; they update.

## Components

The component vocabulary is small on purpose. There is no buttons-cards-inputs library here; the surfaces are mostly tables, captions, and one textarea. Each entry below names where the primitive lives in `web/src/components/`.

### Section caption (`label-cap`)

Every block opens with the same caption: `text-xs uppercase tracking-[0.06em] text-quiet mb-3`. Used in `hero.tsx` (`Portfolio`), `holdings-table.tsx` (`Holdings`), `drill-in.tsx` (`Last 90 days`, `What this means`, `Notes`), `daily-digest.tsx`, `foresight-block.tsx`, `concentration-block.tsx`, `benchmark-block.tsx`, `watchlist-table.tsx`. The recurrence is the affordance: the same gesture means "section starts here."

### Hero (`hero.tsx`)

The home and portfolio routes both lead with a hero section: `border-b border-rule pb-10 mb-10`, `flex flex-col md:flex-row` so the donut wraps under the totals on narrow viewports. Display number left, allocation donut right. No card. No shadow. The only "huge number" in the system is the USD total, in `text-5xl font-light`.

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

`bg-surface-raised border border-rule rounded-sm px-3 py-2`. Focus state shifts the border to `border-accent` (the muted rust); no glow, no ring escalation in the current build (a `focus-visible:ring` would be a future accessibility-only refinement). Save-state caption sits below in `text-xs text-whisper` and reports `saving…`, `Last saved · 30s ago`, or an inline error in `text-loss`. Empty placeholder is italic `text-whisper`: "Thesis, triggers, risks…"

### Navigation tabs (`nav-bar.tsx`)

`text-xs` lowercase tabs in a `flex items-baseline gap-5` strip with a `pb-1 border-b` underline. Active tab: `text-ink border-ink`. Inactive tab: `text-quiet border-transparent` with `hover:text-ink`. Masthead `quiet ledger` sits to the left in `text-sm font-medium tracking-wide text-quiet`. Single header row, `mb-12`.

### Theme toggle (`theme-toggle.tsx`)

A text button, no icon. Cycles `system (light)` → `light` → `dark` → `system (dark)` and renders the current label in `text-xs uppercase tracking-wider text-quiet`. Hover lifts to `text-ink`. The label always shows the *effective* theme; click swaps to the next. No animation on theme change beyond the global `transition-colors`.

### Sparkline (`sparkline.tsx`)

Hand-rolled SVG path, 96×28 viewBox, `strokeWidth=1.25`, `strokeLinecap="round"`. Stroke color is `var(--gain)`, `var(--loss)`, or `var(--quiet)` depending on direction over the 30-day window. SSR-renderable so the table paints in one pass without Recharts' SSR measurement issues.

### Donut (`donut.tsx`)

Hand-rolled SVG paths in the hero, 210px default size. Slices use the `slice-1` to `slice-7` graphite ramp; labels render on the slice rather than in a hover-only tooltip (a v2 papercut, fixed in v3).

### Stacked bars (`concentration-block.tsx`)

Hand-rolled SVG horizontal stacked bars for top-N share and currency exposure. Same graphite ramp as the donut. No traffic-light coloring; concentration "shape" is observational only.

### Line chart (`benchmark-chart.tsx`)

Hand-rolled SVG line chart for portfolio vs benchmark, with a tabular-figure legend below. 30D / 90D / 1Y window toggle in `text-xs uppercase` text buttons. Drawn in two strokes (portfolio `var(--ink)`, benchmark `var(--quiet)`); direction tints not used here because relative path is the message.

### Price chart (`price-chart.tsx`)

The single Recharts surface in the system. Lazy-mounted inside the drill-in (so SSR never tries to measure it), 90-day daily close. Direction tint inherited from the row's total return.

### Skeletons (`insight-block.tsx` loading state, etc.)

`bg-rule/40 animate-pulse` placeholder bars in a two-line grid, holding the same `[5rem_1fr]` shape the resolved insight uses. Skeleton over spinner; shape over motion.

### Calendar mark (inline SVG in `holdings-table.tsx`)

12px outlined-stroke calendar glyph next to a ticker name when earnings is within 14 days. `currentColor` so it follows theme. Title attribute carries `Earnings May 13 · in 8 days` for hover; `aria-label` mirrors. No badge, no pill, no dot. The glyph itself is the cue.

### Named Rules

**The Hand-Rolled-SVG Rule.** Charts that ship in SSR HTML are hand-rolled SVG (sparkline, donut, concentration stack, currency stack, benchmark line). Recharts is reserved for lazy-mounted drill-in surfaces (`price-chart.tsx`) where SSR measurement is not a concern. This is captured in `CLAUDE.md §Conventions`; preserve it.

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
- **Don't** build a hero-metric template (huge number, small label, supporting stats, gradient accent). The classic SaaS cliché is exactly the urgency theater this dashboard rejects.
- **Don't** repeat identical card grids. Same-sized cards with icon + heading + text endlessly is a layout failure.
- **Don't** reach for a modal as the first thought. Exhaust inline and progressive (drill-in) alternatives first.
- **Don't** animate prices in or out. Numbers updating is the data doing its job, not a moment that needs choreography.
- **Don't** animate transform or layout. Color and opacity only, ≤200ms.
- **Don't** use bounce or elastic easing. Ease out with exponential curves (ease-out-quart / quint / expo).
- **Don't** use em dashes in copy. Use commas, colons, semicolons, periods, or parentheses.
- **Don't** introduce a second sans family. One Plex Sans for everything; Plex Mono only for inline code.

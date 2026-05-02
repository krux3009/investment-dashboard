<!-- SEED — re-run /impeccable document once there's code to capture the actual tokens and components. -->
---
name: investment-dashboard
description: A quiet, paper-and-ink reading room for a long-horizon personal portfolio. The opposite of Robinhood.
---

# Design System: investment-dashboard

## Overview: The Quiet Ledger

**Creative North Star: "The Quiet Ledger"**

The dashboard is a paper-and-ink ledger for a long-horizon investor — a place for sitting with positions, not reacting to them. Warm graphite type rests on cream. The accent is rare on purpose. Numbers are reported with the same typographic gravity at 0.2% as at 5%; the data does the talking, not the chrome. Mercury for restraint, Linear for craft, Notion for the canvas-as-page feel — these references combine into a surface that scales from a 15-second phone glance to a 30-minute weekend study session without changing voice.

Explicitly not a Bloomberg full-clone — no twenty-widget overwhelm, no blinking tickers, no metric for the sake of having one. Explicitly not Robinhood — no gotcha-green, no candy gradients, no confetti, no big-number-flex hero. Explicitly not the generic LLM SaaS dashboard either: no Inter on slate-blue with cards-nested-in-cards. The reading room rejects all three by construction.

**Key Characteristics:**
- Paper-cream surface, warm-graphite ink, one rare accent
- One humanist sans family, tabular figures throughout
- Flat by default — depth comes from spacing, not shadow
- Two densities (glance, study) sharing a single visual vocabulary
- Color never carries meaning alone; it reinforces, never replaces

## Colors: The Restrained Palette

The palette is committed to restraint, not poverty. A handful of warm-tinted neutrals carry the surface; one accent appears rarely and forcefully when it does.

### Primary
- **[Accent — to be resolved during implementation]**: A single warm, mid-saturation hue used only on interactive emphasis (the tracked ticker on a chart, the active row in a table, the focused control). The example direction is a muted rust around `oklch(55% 0.12 28)`, but the final hue is decided when implementation begins. Never green. Never red. Never gold.

### Neutral
- **Paper cream** — the surface tint, around `oklch(96% 0.005 75)`. Warm enough to reject "white-paper SaaS" association.
- **Warm graphite ink** — the body and headings, around `oklch(20% 0.008 60)`. Tinted toward the surface family, never `#000`.
- **Border** — around `oklch(86% 0.006 70)`. Hairline weight; visible without shouting.
- **Quiet ink** — around `oklch(45% 0.008 60)`. Secondary text, axis labels, metadata.

### Named Rules
**The One Voice Rule.** The accent is used on ≤10% of any screen. Its rarity is the message. Two accents on one view is one accent too many.

**The No-Green-On-Red Rule.** Gain and loss are never communicated by color alone. Every up/down value carries an arrow (↑/↓), explicit sign (+/−), or positional cue. Color is reinforcement, never the signal.

**The Tinted-Neutral Rule.** Pure black and pure white are forbidden. Every neutral is tinted toward the warm surface family — chroma `0.005–0.01`. The graphite must visibly belong to the cream.

## Typography: One Voice

**Display & Body Font:** A humanist sans-serif family — `[font pairing to be chosen at implementation]`. Direction: warm humanist (e.g. IBM Plex Sans, Public Sans, Source Sans 3, or a similar lane). Explicitly *not* Inter, Geist, SF Pro, or Helvetica — those are the LLM-default reflex.

**Label/Mono Font:** A complementary monospace from the same superfamily where one exists (Plex Sans → Plex Mono), used only for ticker symbols and hash-style identifiers. Numbers stay in the main family with tabular figures.

**Character:** A single voice carries the whole system. The same family handles a 56pt P&L summary and an 11pt axis label, distinguished only by weight, size, and tracking. The family is warm enough to feel considered, restrained enough not to flag itself as a design choice.

### Hierarchy *(scale to be tuned during implementation; relative ratios shown)*
- **Display** (Light, ~clamp(2rem, 5vw, 3rem), tight): Page-level totals or section anchors. Used sparingly.
- **Headline** (Medium, ~1.5rem): Section titles ("Holdings", "Watchlist", "Anomalies").
- **Title** (Medium, ~1.125rem): Card headings, ticker names.
- **Body** (Regular, ~0.9375rem, 65–75ch line length where prose appears): Default reading text.
- **Label** (Medium, ~0.75rem, +0.06em tracking, uppercase): Column headers, small chrome.
- **Numeric** (Regular, tabular figures, `font-feature-settings: 'tnum' 1`): All numbers — prices, percentages, P&L, share counts. Columns of numbers must align under each other; proportional figures are forbidden.

### Named Rules
**The One Family Rule.** Every glyph in the interface comes from a single humanist sans family at varying weights. No serif/sans pairing, no display fonts, no specimen flexing. Voice consistency over typographic variety.

**The Tabular-Numbers Rule.** All numeric data uses tabular figures. Always. A column of prices that doesn't align vertically is a bug.

**The Same-Gravity Rule.** A 0.2% move and a 5% move share the same typographic treatment. Magnitude is read from the digits, not from size.

## Elevation: Flat by Default

The system is flat. Depth comes from spacing, hairline borders, and tonal contrast within the warm-neutral family — not shadows. A panel sits on the surface because of its margin and its border, not because it floats.

This matches Restrained motion energy: surfaces don't lift, hover, or animate vertically. State changes happen in color and weight, not in z-axis.

### Named Rules
**The Flat-By-Default Rule.** Surfaces have no shadow at rest. If a hover state ever introduces shadow, it is hairline (`0 1px 0` ambient at most) and reserved for genuinely interactive elements — never decorative cards.

**The No-Floating-Cards Rule.** Cards are not the default container. Most things are sections divided by spacing and a hairline rule. Cards appear only when a thing is genuinely a discrete affordance — and never nested inside other cards.

## Do's and Don'ts

### Do:
- **Do** keep the accent under 10% of any screen. Its rarity is the point.
- **Do** pair every gain/loss color with an arrow, sign, or position. Color is reinforcement, never the signal.
- **Do** use tabular figures for every number. Always.
- **Do** tint every neutral toward the warm surface family. Chroma `0.005–0.01`. No `#000`. No `#fff`.
- **Do** treat a 5% move and a 0.2% move with the same typographic gravity.
- **Do** scale glance-density to study-density by drilling in, not by switching to a different layout.
- **Do** keep prose at 65–75ch line length where prose appears.
- **Do** use full borders or background tint when separation is needed.

### Don't:
- **Don't** become a Bloomberg / MarketWatch full-clone. Twenty widgets, blinking tickers, every metric possible — the opposite of "quiet enough to think in."
- **Don't** use the crypto neon-on-black hype look. Hot pink / cyan on near-black, glow effects, "to the moon" energy. Wrong audience for a long-horizon holder.
- **Don't** become Robinhood. No gotcha-green, no candy gradients, no confetti animations, no big-number-flex hero. Investing is not Candy Crush.
- **Don't** ship the generic LLM-default SaaS dashboard. No Inter, no slate-blue, no cards-nested-in-cards, no 12px-padding-everywhere. That aesthetic signals "AI made that."
- **Don't** use `border-left` greater than `1px` as a colored accent stripe on cards or alerts. Side-stripe borders are forbidden.
- **Don't** apply `background-clip: text` with a gradient. Gradient text is decorative noise. Use a single solid color, with emphasis through weight.
- **Don't** apply `backdrop-filter: blur` decoratively. No glassmorphism unless it's purposeful and rare.
- **Don't** build a hero-metric template (huge number, small label, supporting stats, gradient accent). The classic SaaS cliché is exactly the urgency theater this dashboard rejects.
- **Don't** repeat identical card grids. Same-sized cards with icon + heading + text endlessly is a layout failure.
- **Don't** use a modal as the first thought. Exhaust inline and progressive alternatives first.
- **Don't** animate prices in or out. Numbers updating is not a moment that needs choreography — it is the data doing its job.
- **Don't** use bounce or elastic easing. Ease out with exponential curves (ease-out-quart / quint / expo).
- **Don't** use em dashes in copy. Use commas, colons, semicolons, periods, or parentheses.

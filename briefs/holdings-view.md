---
feature: holdings-view
status: confirmed
created: 2026-05-02
shape-by: /impeccable shape
register: product
---

# Design Brief: Holdings View

## 1. Feature Summary

The portfolio's primary surface. Renders all live positions from moomoo OpenD as a single table with a one-line summary above. A glance reads the table in 15 seconds; a study session expands rows for deeper context (cost basis, weight, anomaly notes). Replaces the consumer-broker default with a calmer, considered version that doesn't push the user toward minute-by-minute reaction.

## 2. Primary User Action

Read the portfolio. In 15 seconds, answer "did anything materially change since I last looked?" Secondary: drill into any row to interrogate that thesis without leaving the page.

## 3. Design Direction

**Color strategy:** Restrained (project default). Warm-graphite ink on paper-cream. Accent (muted rust `oklch(55% 0.12 28)`) on active row, focus ring, and the single hero portfolio-P&L% number. Gain/loss values use tinted forest/sienna paired with arrows + signs per "The No-Green-On-Red Rule." Color stays well under 10% of pixels.

**Theme via scene sentence:** *"A Singapore-based long-horizon investor opens their laptop on a Sunday morning at the kitchen counter with coffee, glancing at PLTR / ANET / VRT to see if anything material shifted from Friday's close before deciding whether to read the AI-infra weekend newsletter."* Forces light theme. Calm room, daylight, not in a rush.

**Anchor references (this surface specifically):**
- Linear's project list (clean dense rows, hover does the work)
- Stripe Dashboard's transactions table (tabular figures, currency handling)
- Mercury's account ledger (paper-cream warmth, considered numbers)

## 4. Scope

- Fidelity: production-ready
- Breadth: one screen (holdings table + portfolio summary)
- Interactivity: real, fed by live moomoo OpenD data; row expansion functional
- Time intent: polish until it ships, not a sketch
- Mobile: deferred to v2 (laptop-only for v1)

## 5. Layout Strategy

```
THE QUIET LEDGER                              last updated 14:03 SGT

Portfolio  ↑ +2.4%   $124.5K
─────────────────────────────────────────────────────────────────────

Ticker    Qty    Mkt Value     Today      Total P&L
──────
PLTR      250    $6,025  US    ↑ 2.4%     ↑ +18.3%   +$932
ANET       14    $5,772  US    ↓ 0.8%     ↑ +6.1%    +$331
VRT        45    $4,883  US    ↑ 0.3%     ↓ −2.1%    −$103
```

Hierarchy:
1. Hero portfolio P&L% — top-left, "Portfolio" label, accent-colored, the most-glance-able element
2. Table — sorted by portfolio weight desc by default. Tabular figures throughout. Hairline row separators. No card-per-row.
3. Sub-header — small uppercase label-tracking column titles. Quiet ink.
4. Drill-in expansion — click a row → inline expanded section directly below it (same row width, indented, lighter ink) showing cost basis, weight %, today's $ delta, anomaly notes.

Hero P&L% gets the accent color only when value is non-zero; everything else stays in the warm-neutral family.

## 6. Key States

| State | What the user sees |
|---|---|
| Default (live, ≥1 position) | Hero + table. Last-updated timestamp updates each successful poll. |
| Drilled-in (row expanded) | Clicked row's ticker becomes accent-colored. Inline panel below shows cost, weight, today's $ delta, anomaly notes if any. Other rows stay collapsed. Click again to collapse. |
| Empty (no positions) | Hero replaced by "No open positions." in quiet ink. Single line: "Once you hold something on moomoo, it appears here." No CTA, no illustration. |
| Loading (initial fetch) | Skeleton rows in border-color, no spinner. Hero shows "—" in quiet ink. Resolves to real data within ~1s on healthy OpenD. |
| Stale data (OpenD unreachable) | Full table with last-known data. Top label: "Last updated 14 min ago — OpenD unreachable" in `LOSS` color with "⚠" mark. Hero P&L% desaturates ~30%. No modal, no banner. |
| Mixed-currency | Mkt Value column appends small uppercase "US" / "HK" / "CN" tag in quiet ink. Only appears if positions span multiple markets. |
| Anomaly present | Drill-in expansion includes one-line anomaly note pulled from moomoo-technical/capital/derivatives-anomaly skills. Plain text, no badge. |

## 7. Interaction Model

- **Hover row:** quiet ink row-hover background tint (~3% darken), no shadow, no transform. ~150ms ease-out-quart.
- **Click row:** expand inline. ~200ms ease-out-quart height transition. Other rows stay open. Expanded row gets a 1px hairline accent indicator at the left (full row height — *not* a side-stripe per absolute bans).
- **Click expanded row:** collapse.
- **Click ticker:** v1 = same as row-click. v2 may link to per-ticker drill-down.
- **Sort header click:** resort. Default = weight desc. Active column header gets ↑/↓ arrow.
- **Keyboard:** `↑/↓` move row focus. `Enter`/`Space` toggle expand. `Tab` navigates sort headers. Focus ring uses accent at higher chroma.
- **No animations on number updates.** Numbers refresh in place. No count-up, no flash.
- **Polling:** backend fetches every 30s when page is visible (Page Visibility API). Pauses when backgrounded; resumes on focus.

## 8. Content Requirements

- **Page label** (uppercase tracking, quiet ink): "THE QUIET LEDGER"
- **Hero label:** "Portfolio"
- **Hero number format:** `↑ +2.4%   $124.5K` (arrow + signed % + market value, K/M abbreviated)
- **Column headers** (uppercase tracking, quiet ink): "Ticker", "Qty", "Mkt Value", "Today", "Total P&L"
- **Numeric formatting:**
  - Prices: 2 decimals, comma thousands, currency symbol left
  - Percentages: signed, 1 decimal: `+2.4%`, `−18.3%`
  - Absolute P&L: signed, currency symbol, comma thousands: `+$932`, `−$103`
  - Always pair color with arrow + sign
- **Empty state copy:** *"No open positions. Once you hold something on moomoo, it appears here."*
- **Stale-data copy:** *"Last updated [N] minutes ago — OpenD unreachable. Showing previous values."*
- **Anomaly drill-in line example:** *"PLTR · capital-flow spike · 2026-05-02 14:01"* (three fields separated by middle-dots).
- **No em dashes anywhere.** En dashes for ranges, hyphens for word-joins, periods to end thoughts.

Realistic ranges: 0–30 positions; single-position MV $50–$50K; total $0–$500K; 1–3 currencies (USD/HKD/CNH); per-position day move usually −20% to +20%.

## 9. Recommended Reference Files

- `interaction-design.md` — drill-in row, focus, keyboard
- `spatial-design.md` — table rhythm, gutters, hairlines vs full borders
- `typography.md` — tabular figures, hero/table/label ramp
- `color-and-contrast.md` — accent calibration, gain/loss tinting on cream
- `responsive-design.md` — light touch only, mobile deferred

## 10. Open Questions

- **Sort persistence** — recommend yes, localStorage.
- **Anomaly source** — v1 on-demand on row expand; v2 pre-fetch.
- **Currency conversion** — v1 shows per-currency subtotals in drill-in; no conversion.
- **Anomaly cadence** — small "checking…" line during the ~5–15s anomaly call?
- **Active-row visual** — accent on ticker only, or full-row tint? Resolve at first render.

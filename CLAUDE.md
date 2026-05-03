# investment-dashboard — Project Context

## Design Context

This project uses [Impeccable](https://impeccable.style) for design fluency. Strategic context lives in [PRODUCT.md](./PRODUCT.md); visual system in [DESIGN.md](./DESIGN.md) (currently a `<!-- SEED -->` — re-run `/impeccable document` once real code exists to capture actual tokens).

**Quick read:**
- **Register:** product (dashboard, app UI). Design serves the data.
- **Personality:** Quiet · Precise · Considered.
- **North Star:** "The Quiet Ledger" — paper-and-ink ledger for a long-horizon investor.
- **Color:** Restrained — paper cream + warm graphite ink + one rare accent (≤10% of any screen). No `#000`, no `#fff`, no green/red as sole signal.
- **Type:** Single humanist sans family. Tabular figures. Not Inter / Geist / SF Pro / Helvetica.
- **Motion:** Restrained — state changes only. Flat by default.
- **Anti-references:** Bloomberg full-clone, crypto-neon, Robinhood gamification, generic LLM SaaS gray-blue.
- **5 principles:** information-first · calm-under-volatility · two-modes-one-vocabulary · long-horizon-not-trading · signals-not-commands.

Before any UI work, run `node ~/.claude/skills/impeccable/scripts/load-context.mjs` from this directory or invoke any `/impeccable <command>` (loader runs implicitly).

## Project Overview

Personal investment dashboard sitting on top of moomoo OpenD (the local brokerage gateway). Surfaces portfolio + watchlist + anomaly signals for a single long-horizon investor. Two use modes: 15-second daily glance and 30+ minute weekend study sessions. Trade execution stays in the moomoo native app — this is a thinking surface, not an execution surface.

See [moomoo-opend-setup.md](./moomoo-opend-setup.md) for the data-layer foundation and [`tooling-research.md`](./tooling-research.md) for the Claude Code tooling shortlist.

## Status: v2 shipped (2026-05-02), v3 rewrite planned

End-to-end real on Dash + Plotly. Eleven commits past v1 ship, in order:
real-data verification + dedupe-positions fix + SIMULATE-empty hint
(`4b9739e`) → Phase 5 anomaly drill-in via direct moomoo SDK calls
(`4e8f846`) → derivatives category trim (`615eb20`) → allocation donut in
hero (`eaae6d0`) → DuckDB price-history cache + per-row sparklines
(`2cd847d`) → drill-in 90-day price chart (`8f4a847`) → watchlist surface
(`de9cb92`) → moomoo-sourced watchlist via `get_user_security('All')`
(`aee7c92`) → watchlist rows expand into drill-in like holdings
(`d489539`) → lazy-load anomaly section of watchlist drill-in (`79ebc5e`).
GitHub: `krux3009/investment-dashboard`, default branch `main`, private.

**Stack now:** `uv` + Python 3.14 + Dash 4.1 + Plotly + DuckDB +
`moomoo-api 10.4.6408`. Run with `uv run dashboard` (defaults to live
REAL via `.env`). The v2 visual direction (donut + sparklines + drill-in
chart + watchlist) replaced the original "Quiet Ledger / no charts"
brief — design pivoted to "considered research surface" once living with
v1 surfaced that prose-only didn't carry enough information.

**Confirmed brief:** [briefs/holdings-view.md](./briefs/holdings-view.md).
**Decision log + ship notes for everything past v1:**
[briefs/holdings-view-v2-backlog.md](./briefs/holdings-view-v2-backlog.md).
**Visual evidence:** [briefs/screenshots/](./briefs/screenshots/).

## Next: v3 stack rewrite

Living with v2 surfaced four limits the Dash stack can't comfortably
fix: residual interaction lag, low visual ceiling, the confusing "S$90
SGD" mixed-currency hero caption, and donut-without-labels. Plus three
advisor features the user wants layered in (AI daily digest, earnings
calendar, tomorrow's preview).

**v3 plan:** [plan/v3-stack-rewrite.md](./plan/v3-stack-rewrite.md).
Direction: FastAPI backend (reuses the existing `data/` layer verbatim)
+ Next.js + Tailwind + shadcn/ui + Recharts frontend. USD-converted
hero. Phased: A foundation (next sitting) → B visual parity, retire
Dash → C advisor features → D polish.

## Plan folder convention

Active and historical plans live in [plan/](./plan/). Future plans go
there too — never `~/.claude/plans/`, never the repo root, never
scattered into other folders. Plans pair with the project they steer.

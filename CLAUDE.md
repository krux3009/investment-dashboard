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

## Status: v1 shipped (2026-05-02)

The holdings-view shipped at ~38/40 on Nielsen heuristics across 8 commits (`b677b58` → `fc2130a`). Stack: `uv` + Python 3.14 + Dash 4.1 + Plotly + DuckDB + `moomoo-api 10.4.6408`. Run with `uv run dashboard` (defaults to demo mode).

Confirmed brief: [briefs/holdings-view.md](./briefs/holdings-view.md). Deferred items + decision log: [briefs/holdings-view-v2-backlog.md](./briefs/holdings-view-v2-backlog.md). Visual evidence: [briefs/screenshots/](./briefs/screenshots/).

**Read the v2 backlog before opening any new shape on the holdings view.** v1 is signed off; further iteration goes in v2 territory.

## Next-step fork (deferred)

Four directions, ordered by user-leverage:

1. **Phase 4 — DuckDB price-history cache + watchlist view.** The next natural surface; reuses the holdings table vocabulary.
2. **Phase 5 — anomaly skill integration.** Wire `moomoo-technical-anomaly`, `moomoo-capital-anomaly`, `moomoo-derivatives-anomaly` into the holdings drill-in slot.
3. **Real-data verification.** Flip `MOOMOO_USE_DEMO=false` after unlocking trade in the OpenD GUI; surface real-position edge cases.
4. **Stop and revisit later.** v1 is shippable as-is.

# Investment Dashboard — Tooling Shortlist

Researched 2026-05-02. Goal: pick which Claude Code skills, plugins, and MCP servers to install before starting the build.

---

## What you already have (don't reinstall)

These are live in your environment — no action needed:

| Already installed | What it does | Use it for |
|---|---|---|
| `moomoo-stock-digest`, `moomoo-news-search`, `moomoo-comment-sentiment` | News + retail-sentiment for a ticker | Dashboard "news/sentiment" sidebar |
| `moomoo-technical-anomaly`, `moomoo-capital-anomaly`, `moomoo-derivatives-anomaly` | Three anomaly-detection layers | Watchlist alerting / "what's unusual today" panel |
| `moomooapi` | Official moomoo Python SDK assistant | Writing the Python data-fetching code |
| `frontend-design` (Anthropic official) | Production-grade UI scaffolding | Avoiding generic AI dashboard look |
| `frontend-slides`, `huashu-design` | Slides + Chinese-flavored hi-fi prototypes | Demoing the dashboard later |
| `playwright` MCP | Browser automation | Fallback for any moomoo web-UI-only views |
| `firecrawl`, `scrapling-official` | Web scraping with anti-bot bypass | Pulling news/macro data from sites that block direct fetch |
| `claude-api` | Anthropic SDK assistant | If you embed Claude into the dashboard for analysis |

---

## Tier 1 — Install Day 1 (free, high-leverage)

| Tool | Type | Why | Install |
|---|---|---|---|
| **`Litash/moomoo-api-mcp`** | MCP server | Direct bridge from your existing OpenD to Claude Code — quotes, K-lines, account, positions, orders. **Highest priority — matches your exact broker.** | `uvx --refresh moomoo-api-mcp` (config → `127.0.0.1:11111`) |
| **`context7`** (Anthropic partner) | MCP server | Auto-injects current docs for Recharts / FastAPI / Plotly / Dash / shadcn so Claude doesn't hallucinate APIs. Free. | `claude mcp add context7 -- npx -y @upstash/context7-mcp@latest` |
| **`code-review`** (Anthropic official) | Plugin | `/code-review` runs 5 parallel agents w/ confidence scoring. Worth it because this project handles credentials. | `/plugin install code-review@claude-plugins-official` |
| **`security-review`** (Anthropic official) | Plugin | `/security-review` for SQL injection, auth flaws, key leaks. **Most important plugin given moomoo trading password is in scope.** | Same marketplace |

> Caveat: moomoo-api-mcp defaults to **REAL** trading account. Always pass `trd_env='SIMULATE'` until you trust the code.

---

## Tier 2 — Install when you start coding

| Tool | Type | Why | Notes |
|---|---|---|---|
| **`tradermonty/claude-trading-skills`** | Skill pack (54+) | Cherry-pick: Portfolio Manager, Position Sizer, Technical Analyst, Sector Analyst, Macro Regime Detector, Economic/Earnings Calendars. | Portfolio Manager is wired to **Alpaca**, not moomoo — fork or use as analytics layer |
| **`agiprolabs/claude-trading-skills`** | Skill pack (62) | More breadth — pick the equity/portfolio subset (Sharpe, Sortino, Kelly, regime detection). Skip the crypto/Solana skills. | `/plugin marketplace add agiprolabs/claude-trading-skills` |
| **`JoelLewis/finance_skills`** (`wealth-management` plugin only) | Plugin | VaR, drawdown, DCF, rebalancing, tax-loss harvesting. | `npx skills add JoelLewis/finance_skills --plugin wealth-management` |
| **`Shadcnblocks-Skill`** + **Chart Implementation skill** | Skills | Maps directly to dashboard layout (sidebar + holdings table + chart panel + KPI cards) using shadcn + Recharts. | Free, GitHub install. Skip $19/mo Pro shadcn MCP for now |
| **MotherDuck DuckDB MCP** | MCP server | Local price-history cache. Faster than SQLite for time-series window queries. | Avoids re-hammering moomoo OpenAPI on every chart refresh |
| **`mcp-yfinance`** | MCP server | Free fundamentals fallback when moomoo is gappy (e.g. non-HK/US tickers, analyst targets). | No API key |

---

## Tier 3 — When deploying

| Tool | Type | Why |
|---|---|---|
| **Vercel plugin** (Anthropic partner) | Plugin | Easiest React deploy. Free hobby tier. Skip if you stick with Python+Dash. |
| **Supabase plugin** (Anthropic partner) | Plugin | If SQLite outgrows you — managed Postgres + auth + realtime. |
| **Sentry plugin** (Anthropic partner) | Plugin | Catches "OpenD disconnected" / "rate-limited" silent failures in production. |

---

## Tier 4 — Situational / probably skip

- **Alpaca MCP** — only if you want US paper-trading alongside moomoo
- **Alpha Vantage MCP** — useful for free technical indicators, but tradermonty skills compute most of these locally
- **Polygon.io MCP** — true real-time, but paid. Overkill for personal dashboard
- **Anthropic `financial-services-plugins`** — built around FactSet/S&P/LSEG, institutional pricing. **Skip.**

---

## YouTube watch order (3 videos, ~80 min total)

1. **Pythonic Accountant — Financial Dashboard with Python + Dash + Plotly + Claude Code** (26 min) — https://www.youtube.com/watch?v=DV4WysEaVjo — closest match to your stack. Watch first.
2. **AI Pathways — Build a Trading Bot with Claude Code** (34 min) — https://www.youtube.com/watch?v=y_bsjZThP0o — overall scaffolding pattern (API client, scheduler, persistence).
3. **Across The Rubicon — ULTIMATE Claude Code trading assistant setup** (10 min) — https://www.youtube.com/watch?v=vTkZK8PK114 — concise install pass.

Optional add-ons:
- **Lewis Jackson — Connect Claude to TradingView** (20 min, 710K views) — https://www.youtube.com/watch?v=vIX6ztULs4U — only if you want to embed TradingView charts
- **Chase AI — Claude Code + Playwright** (14 min) — https://www.youtube.com/watch?v=I9kO6-yPkfM — only relevant if moomoo OpenAPI is missing a view you need

---

## Stack recommendation (separate from tooling)

Given you're a first-year IS student, solo, with strong Python and starting React:

**Recommended start: Python + Dash + Plotly** (one process, no React build chain, one-file deploy). Move to React + FastAPI only once you want a polished public version. The Pythonic Accountant video uses this exact stack.

Reasons:
- Plotly has built-in candlestick / OHLC charts — Recharts doesn't
- Dash is enough for a personal dashboard; React adds 80% of the build complexity for 20% of the visual win
- One language end-to-end matches your moomoo Python SDK skill

---

## Key caveat (from HN discussion)

Pulling 5 years of daily prices through an MCP server can dump tens of thousands of tokens into context. **Cache prices in DuckDB, have the dashboard backend pre-aggregate, and only pass summaries to Claude.** Don't let MCP tools shovel raw OHLC into the model.

---

## Sources

Two research reports informed this list:
- Web search (plugins, MCP servers, awesome lists) — covered Anthropic official marketplace, community skill packs, financial data MCPs
- YouTube + tutorials search — covered creators (AI Pathways, Pythonic Accountant, etc.) and written guides

Full source URLs are in the agent transcripts in this conversation.

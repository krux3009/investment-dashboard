# The Quiet Ledger

![status](https://img.shields.io/badge/status-work--in--progress-orange) ![purpose](https://img.shields.io/badge/purpose-personal-blue) ![license](https://img.shields.io/badge/license-no%20warranty-lightgrey) ![not-financial-advice](https://img.shields.io/badge/not-financial%20advice-red)

Personal investment dashboard on top of moomoo OpenD.

> ⚠️ **This is a personal project, work-in-progress, no warranty.** It is not investment advice, not a financial product, and not audited. Numbers shown are educational framing only — buy / sell / hold / target / forecast language is deliberately stripped from every advisor surface. Run it against your own moomoo account at your own risk. The author takes no responsibility for any decisions made using this code.

> Strategic context: [PRODUCT.md](./PRODUCT.md) · Visual system: [DESIGN.md](./DESIGN.md) · Project context: [CLAUDE.md](./CLAUDE.md)

## Run it

Prerequisites:
- moomoo OpenD running on `127.0.0.1:11111` (see [moomoo-opend-setup.md](./moomoo-opend-setup.md))
- [`uv`](https://docs.astral.sh/uv/) installed
- [Node.js 18+](https://nodejs.org/) for the frontend

```bash
cp .env.example .env          # first time only
uv sync                       # install backend deps from uv.lock
cd web && npm install && cd ..

# Two terminals
uv run api                    # http://127.0.0.1:8000  FastAPI backend
cd web && npm run dev         # http://localhost:3000  Next.js frontend
```

## Layout

```
src/api/                       ← FastAPI backend
├── main.py                    ← app + CORS + uvicorn cli
├── models.py                  ← Pydantic response models
├── fx.py                      ← yfinance FX rates (1h in-memory cache)
├── data/                      ← live moomoo data layer
│   ├── positions.py
│   ├── moomoo_client.py       ← OpenSecTradeContext wrapper
│   ├── prices.py              ← DuckDB-cached daily bars
│   └── anomalies.py           ← OpenQuoteContext.get_*_unusual wrappers
└── routes/                    ← /api/holdings, /api/prices/{code},
                                 /api/anomalies/{code}, /api/watchlist

web/                           ← Next.js 16 + Tailwind 4 + Recharts
├── src/app/                   ← App Router (Server Components)
├── src/components/            ← Hero, Holdings, Watchlist, Donut,
│                                Sparkline, PriceChart, DrillIn, …
└── src/lib/                   ← typed API client, formatters
```

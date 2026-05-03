# web — Next.js frontend (v3, Phase A)

Phase A scaffold: a Server Component renders one fetch from the FastAPI
backend (`/api/holdings`) as an unstyled HTML table. No styling beyond
Tailwind reset; visual work lives in Phase B (see
[`../plan/v3-stack-rewrite.md`](../plan/v3-stack-rewrite.md)).

## Dev workflow (three terminals)

The v3 rewrite runs alongside the v2 Dash app until parity. From the
project root in three separate terminals:

```bash
# Terminal 1 — v2 Dash app (still primary)
uv run dashboard          # http://localhost:8050

# Terminal 2 — v3 FastAPI backend
uv run api                # http://127.0.0.1:8000  (auto-reload on src/)

# Terminal 3 — v3 Next.js frontend
cd web && npm run dev     # http://localhost:3000
```

CORS in `api/main.py` allows `http://localhost:3000` and
`http://127.0.0.1:3000`. To point the frontend at a different
host/port, set `NEXT_PUBLIC_API_BASE` (e.g. in `web/.env.local`).

## Sanity checks

```bash
curl -s http://127.0.0.1:8000/api/health           # {"status":"ok"}
curl -s http://127.0.0.1:8000/api/holdings | jq    # full holdings JSON
```

`http://localhost:3000` should render a table of every position with a
USD-converted market value, and a hero summary with the
USD-aggregated total.

## What the scaffold installed

`create-next-app@latest` 16.2.4 with: TypeScript, Tailwind 4, App
Router, `src/` layout, `@/*` alias, no ESLint, no Turbopack. Next.js
16 has breaking changes from earlier versions — see
[`AGENTS.md`](./AGENTS.md) and the in-tree docs at
`node_modules/next/dist/docs/`.

## Structure

```
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx     ← scaffolded; Geist fonts, h-full body
│   │   ├── page.tsx       ← Phase A: fetch + unstyled table
│   │   └── globals.css    ← Tailwind reset + scaffolded base styles
│   └── lib/
│       └── api.ts         ← typed client; mirrors api/models.py
├── package.json
└── tsconfig.json
```

## What stays in Dash for now

The v2 dashboard (donut hero, sparklines, drill-in chart, watchlist,
anomaly drill-in) keeps running on `:8050` until Phase B reaches
visual parity here. Don't edit `src/dashboard/` during Phase A — the
plan is to retire it in one stroke once the React surface is ready.

# web — Next.js frontend

The v3 dashboard surface. Hero with USD-aggregated totals and an
allocation donut, holdings table with sortable columns + sparklines +
expand-to-drill-in (90-day chart + anomaly prose), watchlist with the
same expand pattern. IBM Plex Sans, warm-graphite oklch palette,
dual-theme via `next-themes`.

## Dev workflow (two terminals)

From the project root in two separate terminals:

```bash
# Terminal 1 — FastAPI backend
uv run api                # http://127.0.0.1:8000  (auto-reload on src/)

# Terminal 2 — Next.js frontend
cd web && npm run dev     # http://localhost:3000
```

CORS in `api/main.py` allows `http://localhost:3000` and
`http://127.0.0.1:3000`. To point the frontend at a different
host/port, set `NEXT_PUBLIC_API_BASE` (e.g. in `web/.env.local`).

## Sanity checks

```bash
curl -s http://127.0.0.1:8000/api/health           # {"status":"ok"}
curl -s http://127.0.0.1:8000/api/holdings | jq    # full holdings JSON
curl -s http://127.0.0.1:8000/api/watchlist | jq   # symbols
```

`http://localhost:3000` renders the hero + donut + holdings table +
watchlist, with every non-USD position FX-converted on the wire.

## Stack

`create-next-app@latest` 16.2.4 with: TypeScript, Tailwind 4, App
Router, `src/` layout, `@/*` alias, no ESLint, no Turbopack. Plus
Recharts (lazy drill-in chart only — sparkline + donut are
hand-rolled SVG for SSR cleanliness), `next-themes`, `clsx`,
`tailwind-merge`, `tailwind-variants`, `@remixicon/react`.

Next.js 16 has breaking changes from earlier versions — see
[`AGENTS.md`](./AGENTS.md) and the in-tree docs at
`node_modules/next/dist/docs/`.

## Structure

```
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx       ← IBM Plex fonts, ThemeProvider
│   │   ├── page.tsx         ← server-fetches holdings + watchlist + sparklines
│   │   └── globals.css      ← Tailwind 4 + warm-graphite tokens (light + dark)
│   ├── components/
│   │   ├── hero.tsx
│   │   ├── donut.tsx        ← hand-rolled SVG, labels on slices
│   │   ├── holdings-table.tsx  ← sortable headers, sparkline col, drill-in
│   │   ├── watchlist-table.tsx ← same shape, no qty/cost cols
│   │   ├── sparkline.tsx    ← hand-rolled SVG path
│   │   ├── price-chart.tsx  ← Recharts LineChart (drill-in only)
│   │   ├── drill-in.tsx     ← lazy-loaded 90d chart + anomaly section
│   │   ├── anomaly-block.tsx
│   │   ├── theme-provider.tsx
│   │   └── theme-toggle.tsx
│   └── lib/
│       ├── api.ts           ← typed client; mirrors api/models.py
│       ├── format.ts        ← Unicode minus, signed numbers, arrows
│       └── utils.ts         ← cn() helper
├── package.json
└── tsconfig.json
```

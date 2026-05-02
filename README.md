# The Quiet Ledger

Personal investment dashboard on top of moomoo OpenD.

> Strategic context: [PRODUCT.md](./PRODUCT.md) · Visual system: [DESIGN.md](./DESIGN.md) · Tooling: [tooling-research.md](./tooling-research.md)

## Run it

Prerequisites:
- moomoo OpenD running on `127.0.0.1:11111` (see [moomoo-opend-setup.md](./moomoo-opend-setup.md))
- [`uv`](https://docs.astral.sh/uv/) installed

```bash
cp .env.example .env          # first time only
uv sync                       # install / update deps from uv.lock
uv run dashboard              # open http://127.0.0.1:8050
```

## Layout

```
src/dashboard/
├── __init__.py    # exposes main()
├── __main__.py    # `python -m dashboard` entry
├── app.py         # Dash app + layout assembly
├── theme.py       # design tokens (mirrors DESIGN.md)
├── data/          # moomoo client + DuckDB cache (Phase 2-4)
└── views/         # holdings, watchlist, anomalies (Phase 3-5)
```

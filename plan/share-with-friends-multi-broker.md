# Open the dashboard to friends — local install + in-app settings + Webull support

## Context

Today the dashboard is single-tenant: all moomoo connection details and the Anthropic key live in one `.env` file, loaded at module import (`src/api/main.py:12-14`). Reading the values is hard-wired across ~10 modules (`src/api/data/moomoo_client.py:86-110`, `src/api/data/anomalies.py:94-95`, `src/api/benchmark.py:56`, `src/api/routes/watchlist.py:118-119`, every advisor route, etc.).

Goal: a small group of friends should be able to clone the repo, run it locally, and use it with their own brokerage data — no hosting yet. Decisions confirmed with user:
- **Anthropic key**: shared via a `.env` file you hand them privately. They never need an Anthropic account.
- **Brokers**: both moomoo *and* Webull. Webull is added as a parallel client.
- **First-run UX**: hard-redirect to `/settings` until the broker is configured.

Out of scope: hosting on a server, multi-tenant auth, mobile install. Each friend runs everything locally on their own machine. moomoo OpenD (and Webull's local prerequisites — none, but its login flow) must still happen on each friend's machine; no settings UI can replace that.

---

## Approach

### 1. Settings persistence (DuckDB, not `.env` mutation)

- New table `settings` in `data/prices.duckdb`, single row `(key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL, updated_at TIMESTAMP)` with values stored as JSON strings. Mirrors the lock + thread pattern in `src/api/data/notes.py:27-32`.
- New module `src/api/data/settings.py` exposing `get_settings()`, `save_settings(patch)`, `is_configured()`. In-process cache invalidated on save.
- Resolution order for any config value: **settings table → env var → hardcoded default**. Lets you keep `.env` as the bootstrap for the Anthropic key while moving brokerage params into the UI.
- `.env` continues loading at `src/api/main.py:12-14` for `ANTHROPIC_API_KEY` only.

### 2. Broker abstraction

- New `src/api/data/broker.py` defines a `BrokerClient` Protocol with: `get_positions()`, `get_quotes(codes)`, `get_daily_bars(code, days)`, `supports_anomalies` (bool capability flag), `get_anomalies(code)` (optional), `test_connection()`.
- Refactor `src/api/data/moomoo_client.py` so `MoomooClient` reads from `get_settings()` instead of env directly and conforms to the Protocol. `OpenSecTradeContext` / `OpenQuoteContext` construction (lines 87-92, 70-72 in `anomalies.py`) takes its host/port/security_firm from settings.
- New `src/api/data/webull_client.py` using **tedchou12/webull** (unofficial; pin a version). Implements positions / quotes / daily bars by normalising Webull's plain symbols (`NVDA`) into the existing `Position` dataclass `code` format (`US.NVDA`). Sets `supports_anomalies = False` — Webull has no public unusual-options or capital-flow endpoint.
- New `get_active_broker()` factory dispatches on `settings["broker"]` ∈ `{"moomoo", "webull"}`. Cached; invalidated on settings save.
- Routes that today instantiate `MoomooClient` directly (`routes/holdings.py`, `routes/quotes.py`, `routes/prices.py`, `routes/watchlist.py`) call `get_active_broker()` instead. Anomaly route (`routes/anomalies.py`) returns `501 Not Implemented` with a stable shape when `supports_anomalies=False`, and the drill-in renders a caption ("Anomaly prose unavailable for Webull — use moomoo for capital-flow signals") instead of raising.

### 3. Settings API (`src/api/routes/settings.py`)

- `GET /api/settings` → current config (sensitive fields redacted: Webull password, trade PIN, Anthropic override).
- `PUT /api/settings` → save patch, invalidate broker + settings caches.
- `GET /api/settings/configured` → `{"configured": bool}` — backs the first-run gate.
- `POST /api/settings/test` → opens the active broker, returns `{ok, latency_ms, error?}`.
- `POST /api/settings/webull/login` → two-step MFA flow: step 1 sends SMS/email code, step 2 submits code + trade PIN, persists Webull's refresh token. (Webull tokens rotate; the client refreshes on use.)

### 4. Settings UI (`web/src/app/settings/page.tsx`)

Single page, sections in order:
1. **Broker** — radio (moomoo · Webull). Switching disables the other section's inputs.
2. **moomoo** — host, port, trd_env (`SIMULATE` / `REAL` dropdown), security_firm dropdown, watchlist group, watchlist override (comma list). Inline help: "Make sure OpenD is running and you've manually unlocked trade in the OpenD GUI."
3. **Webull** — email + password + MFA-code button → SMS step → trade PIN. Caveat caption: "Webull's API is unofficial; expect occasional breakage when Webull updates their app." After successful login, show "Connected as <email>" + a `Re-authenticate` button.
4. **Watchlist + benchmark** — broker-agnostic comma lists.
5. **Anthropic key (optional)** — empty by default; populated only if friend wants to use their own key instead of the shared one.
6. **Test connection** button + green/red status pill, then **Save**.

New components: `web/src/components/settings-form.tsx`, `web/src/components/broker-status.tsx`. Reuse `cn` and form styling tokens from existing components (`web/src/components/hero.tsx`, drill-in inputs in `web/src/components/drill-in.tsx`).

### 5. First-run gate

- `web/src/middleware.ts` calls `/api/settings/configured`; if `false` and the route is anything but `/settings`, returns a redirect. Configured == settings row exists with a non-empty `broker` key + the chosen broker passes `test_connection()` at least once (a `last_ok_at` field in settings tracks this).
- Add a Settings link to `web/src/components/nav-bar.tsx:7-11` (becomes a 4-tab nav).

### 6. Distribution

- New `SETUP.md` for friends: prerequisites (Python 3.14, uv, Node, OpenD download link or Webull account), `git clone`, drop the shared `.env` you sent them at the repo root (Anthropic key only — moomoo creds go through the UI), `uv sync`, `cd web && npm install`, two-terminal run, open `localhost:3000`, fill settings.
- README.md gets a one-line pointer to SETUP.md.
- `.env.example` slimmed to `ANTHROPIC_API_KEY=` only — moomoo vars become legacy fallbacks (still read but not documented).

### 7. Security caveats (surface in SETUP.md + a settings-page footer)

- Webull email/password and trade PIN sit in `data/prices.duckdb`. Mitigation: chmod 0600 the DB on save, recommend FileVault / BitLocker. If a friend's machine is shared, that's their risk.
- Anthropic `.env` is shared privately — committed to no repo, sent through Signal/iMessage/equivalent. If anyone leaks it, you rotate.
- moomoo trade unlock stays manual in OpenD GUI (existing constraint per `moomoo-opend-setup.md:28`). Settings UI documents this; it does **not** try to script trade unlock.

---

## Critical files

**New (backend):**
- `src/api/data/broker.py` — Protocol + `get_active_broker()`
- `src/api/data/settings.py` — DuckDB-backed settings store
- `src/api/data/webull_client.py` — Webull implementation
- `src/api/routes/settings.py` — settings + test + Webull login routes

**Modified (backend):**
- `src/api/data/moomoo_client.py:62-110` — read from settings, conform to Protocol
- `src/api/data/anomalies.py:70-95` — accept host/port from settings via the broker
- `src/api/routes/holdings.py`, `routes/quotes.py`, `routes/prices.py`, `routes/watchlist.py` — replace direct `MoomooClient()` with `get_active_broker()`
- `src/api/routes/anomalies.py` — 501 path when `supports_anomalies=False`
- `src/api/main.py:46-60` — register settings router
- `src/api/benchmark.py:56` — read benchmark from settings (env fallback)

**New (frontend):**
- `web/src/app/settings/page.tsx`
- `web/src/components/settings-form.tsx`
- `web/src/components/broker-status.tsx`
- `web/src/middleware.ts`

**Modified (frontend):**
- `web/src/components/nav-bar.tsx:7-11` — add Settings tab
- `web/src/components/drill-in.tsx` — "anomaly prose unavailable" caption when broker lacks support

**Docs:**
- `SETUP.md` (new), `README.md` (one-line pointer), `.env.example` (slim to Anthropic only)

**Reuse:**
- `src/api/data/notes.py:27-32` — pattern for the new settings table (single-writer DuckDB with thread lock)
- `src/api/data/positions.py` — `Position` dataclass; both broker clients normalise into it
- `web/src/components/drill-in.tsx` form/textarea styling for settings inputs

---

## Verification

```bash
# Fresh install (delete data/prices.duckdb first)
rm data/prices.duckdb
uv run api &
cd web && npm run dev &

# 1. First-run gate
curl -s localhost:8000/api/settings/configured  # → {"configured":false}
open http://localhost:3000                       # redirects to /settings

# 2. moomoo flow
# Fill moomoo form (host=127.0.0.1, port=11111, trd_env=SIMULATE, etc.) → Test → green
# Save → redirected to /
curl -s localhost:8000/api/holdings | jq '.holdings | length'   # → matches positions
curl -s localhost:8000/api/anomalies/US.NVDA | jq -r .prose      # → plain English

# 3. Switch to Webull
# /settings → choose Webull → email + password + SMS code + PIN → Test → green → Save
curl -s localhost:8000/api/holdings | jq '.holdings | length'   # → Webull positions
curl -s localhost:8000/api/anomalies/AAPL                        # → 501 + caption shape
# Drill-in on /portfolio renders "Anomaly prose unavailable for Webull"

# 4. Anthropic override
# /settings → paste alt key → Save → /api/digest still works (cache invalidated)

# 5. Friend dry-run
# On a clean macOS account: clone + drop shared .env + uv sync + npm install + run
# Should reach /settings within 60s of first npm run dev
```

---

## Caveats & follow-ups (not blocking this plan)

- **Webull SDK risk.** tedchou12/webull is unofficial and reverse-engineered. Pin the version. When Webull breaks the API, the dashboard's Webull section breaks too — the moomoo path is untouched. Document this in SETUP.md.
- **No anomaly parity.** Webull users lose the anomaly drill-in prose. Acceptable for v1; document in the UI.
- **Single broker per install.** No "use both at once" — switching wipes the broker cache. Multi-broker aggregation is a future phase.
- **Future hosting.** When you do host this, the Anthropic-bundled-via-`.env` model breaks (anyone hitting your server uses your key). At that point swap to the proxy approach you considered. This plan keeps that door open: Anthropic key resolution already goes settings → env, so a hosted version can drop the env and require per-user keys without code surgery on every advisor route.

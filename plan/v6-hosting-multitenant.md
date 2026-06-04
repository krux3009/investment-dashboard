# v6 — Hosting + multi-tenant ("friends log in with their own key")

Parked plan, drafted 2026-06-04. Not started. The goal: a hosted site
where friends sign in and see their own portfolio via their own broker
credentials. This doc captures the architecture, the one hard blocker,
and a phased path so it can be picked up cold.

---

## The one hard blocker — read this first

**moomoo OpenD cannot back a hosted multi-tenant site.** moomoo/futu's
OpenAPI *is* OpenD: a local desktop gateway each person installs and
logs into with their own moomoo account; the Python SDK connects to
`127.0.0.1:11111`. There is **no per-user cloud API key** moomoo issues
that a hosted server could use to read a friend's positions. The two
moomoo-on-a-server workarounds are both rejected:

- Running each friend's OpenD on our server with their moomoo
  credentials + 2FA → holding live brokerage logins (with trade
  permission) on a rented box. Unacceptable security + trust + ToS risk.
- Each friend runs OpenD locally + the site tunnels back to their
  machine → they need their computer on anyway, defeating the host.

**Conclusion:** the friends-login feature requires swapping the hosted
data source to a broker/aggregator that has a real per-user cloud API.
moomoo stays as *Li Xuan's own local mode*, one `BrokerClient` impl
among several — never the hosted one.

The right seam already exists: the `BrokerClient` Protocol sketched in
[`share-with-friends-multi-broker.md`](./share-with-friends-multi-broker.md).
Build the hosted data source as another implementation behind it.

---

## Data-source options (behind `BrokerClient`)

| Source | Per-user cloud API? | Notes |
|---|---|---|
| **Alpaca** | ✅ best | Free US broker, REST API, OAuth + per-user keys, **paper-trading sandbox**. The standard choice for this exact pattern. Start here. |
| **SnapTrade / Plaid Investments** | ✅ | Aggregators — friend OAuths their existing brokerage; one API returns holdings across many brokers. More setup, broader coverage. Phase 2+. |
| **moomoo (OpenD)** | ❌ for hosting | Stays the local mode for the owner's real account. Keep as a `BrokerClient` impl, not deployed. |

**Decision to make later:** Alpaca-only (simplest, paper-first) vs an
aggregator (covers friends on other brokers). Recommendation: Alpaca
paper first to prove the multi-tenant plumbing, add an aggregator only
if friends actually use other brokers.

---

## What the hosted version needs that today's app lacks

Today the app is a single-user local tool. Multi-tenant hosting adds
four hard requirements:

1. **Cloud-API data source** behind `BrokerClient` — Alpaca paper first.
2. **Auth + multi-tenancy** — accounts, sessions, per-request user
   scoping. Candidates: Clerk, Auth.js (NextAuth), Supabase Auth.
3. **Per-user secret storage** — broker keys encrypted at rest, never
   logged, decrypted only in-process per request. Paper-trading keys
   first to keep the blast radius small. Consider a real secrets store
   (host vault / KMS-encrypted column) over plain env.
4. **Drop local DuckDB.** `prices.duckdb` is single-writer + local (see
   CLAUDE.md §Conventions). A multi-user server needs **Postgres**
   (Supabase / Neon). Every cache + notes table grows a `user_id`;
   the advisor caches stay keyed on `(user, dimension, prompt_version)`.

Other things that must change:
- **SSE broadcaster** (`realtime.py`) is one process-wide task today;
  multi-tenant means per-user streams (or a shared market snapshot fanned
  out per user's holdings). Re-think before scaling.
- **FX / fundamentals / prices caches** are shared-public data — those
  can stay global (no `user_id`), which saves work. Only *position*-
  derived data is per-user.
- **`ANTHROPIC_API_KEY`** — decide: one shared platform key (you pay for
  all advisor calls — rate-limit + cost-cap per user) vs each user
  brings their own. Shared key + per-user quota is friendlier; cost is
  on you. Cap it.

---

## Target stack

```
Next.js frontend        → Vercel
FastAPI backend         → Render / Fly.io / Railway
Postgres                → Supabase / Neon
Auth                    → Clerk / Auth.js / Supabase Auth
Per-user broker keys    → encrypted column (KMS/libsodium) or host vault
Data source             → Alpaca (paper) behind BrokerClient
Public data (fx/prices/fundamentals/Anthropic) → unchanged, server-side
```

---

## Phased path

### Phase 0 — Self-host now (1 evening, do this first regardless)

The app *as it exists today* (moomoo local) only needs private remote
access, not a public deploy. Keep OpenD + FastAPI + Next on the Mac;
expose privately:

- **Tailscale** (simplest): install on Mac + phone, hit the Mac's
  tailnet IP:3000. Zero data on any public server, OpenD never leaves
  the machine, ~0 cost. — OR —
- **Cloudflare Tunnel**: `cloudflared tunnel` → a private hostname.

Outcome: pull the dashboard up on the phone from anywhere. No code
changes. This is the correct "hosting" for the current architecture.

### Phase 1 — Public demo URL (optional, half a day)

For a resume / internship link. Deploy the **frontend only** to Vercel
backed by **seeded mock data** (a static JSON fixture or a tiny mock
backend) — no OpenD, no real holdings. Exposes nothing real; shows the
UI + SWS surfaces (snowflake, the five analysis axes, dividends, etc.).
Gate the real `API_BASE` behind an env flag so the same build can run
mock (public) or live (local).

### Phase 2 — Multi-tenant foundation (the real milestone)

1. **`AlpacaClient` behind `BrokerClient`** — positions + quotes from
   Alpaca paper. Mirror the `Position` dataclass the rest of the app
   expects so `holdings_payload` etc. are untouched.
2. **Postgres migration** — port the DuckDB tables to Postgres, add
   `user_id` to position-derived tables (notes, digest_tiles_cache,
   snowflake_cache, fundamentals_cache→keep public, fair_value→public).
   Keep public-data caches global.
3. **Auth** — sign-up / sign-in; protect every `/api/*` route with the
   session; scope all queries by `user_id`.
4. **Per-user key onboarding** — a settings screen where a friend pastes
   their Alpaca paper key/secret; store encrypted; use per request.
5. **Deploy the split stack** (Vercel + Render + Supabase). Secrets in
   the host's encrypted env / vault.

### Phase 3 — Polish / scale

- Per-user SSE (or shared snapshot fan-out) rework.
- Aggregator (SnapTrade/Plaid) for friends on non-Alpaca brokers.
- Anthropic cost caps + per-user rate limiting.
- Onboarding, empty states, "connect your broker" flow.

---

## Security checklist (Phase 2 gate — do not skip)

Hosting a multi-user finance app that holds other people's API keys is
real responsibility. Before any friend's key touches the server:

- [ ] Broker keys **encrypted at rest** (KMS or libsodium sealed),
      decrypted only in-process. Never in plaintext env per-user.
- [ ] Keys **never logged** — scrub from request logs + error traces.
- [ ] **Paper-trading only** to start (no live trade permission).
- [ ] HTTPS everywhere; secure, http-only session cookies.
- [ ] Every `/api/*` query scoped by authenticated `user_id` — no IDOR
      (a user can never read another user's holdings/notes).
- [ ] Rate-limit + cost-cap the shared Anthropic key per user.
- [ ] A clear "this is a personal project, paper data, not financial
      advice" disclaimer — consistent with the existing FORBIDDEN
      framing rules in CLAUDE.md.

---

## Open decisions to settle when resuming

1. Alpaca-only vs aggregator (SnapTrade/Plaid)?
2. Shared platform Anthropic key (you pay, capped) vs bring-your-own?
3. Auth provider (Clerk fastest, Supabase Auth bundles with the DB)?
4. Does the owner's *real* moomoo book live on the same hosted site (via
   a local-agent tunnel) or stay a separate local-only mode? (Recommend:
   separate local mode — don't entangle real-money data with the host.)

---

## Why not just put moomoo on a cloud VM?

Asked-and-answered above, but to bury the temptation: OpenD *can* run
headless on Linux, so technically a cloud VM could host the owner's own
OpenD. But it needs the owner's moomoo login + device verification on a
rented box, runs a live brokerage session (trade-capable) off-machine,
and does not generalise to friends at all. For a personal project the
risk/upside is wrong. Tailscale-to-Mac (Phase 0) gives the same remote
access with none of that exposure.

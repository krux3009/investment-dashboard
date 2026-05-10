# v3 Phase E — follow-ups after Phase D + foresight + D5

Cleanup / monitoring work tracked here after the main v3 milestones
(Phase A through D5 + foresight) shipped. Each entry is small-scope —
parked when not urgent, executed when promoted to a session backlog.

---

## v4 prompt watch log

Tracks substring-leak audits of `digest_tiles_cache` after each
`_PROMPT_VERSION` bump. Decides whether to bump `v4 → v5` based on
how often Claude reaches for newly-banned-adjacent phrases.

### Background

- v3 → v4 (2026-05-08, PR #10, `76f4c66`) added `momentum`, `decelerat`,
  `mover` to `FORBIDDEN_BASE`. v3 audit had found 3 leaks:
  `MU/technical: deceleration`, `INTC/technical: momentum + deceleration`,
  `ANET/news: momentum`.
- v4 first-build substitutes Claude reached for: `pace reduction ahead`,
  `losing pace`, `Q1 AI results`. The first two were called out in
  `sessions/2026-05-08.md` "Improvements for next session" item #3 as
  borderline — characterizing magnitude/direction-of-trend rather than
  reporting numbers.
- Session-recap directive: **"Watch over a week before bumping v4 → v5."**

### Audit method

Run from repo root:

```bash
duckdb data/prices.duckdb \
  "SELECT code, fundamentals, news, sentiment, technical
   FROM digest_tiles_cache WHERE prompt_version='v4'
   ORDER BY code"
```

Substrings to check (case-insensitive grep across all four prose columns):

- `pace reduction`
- `losing pace`
- `pace of`
- `easing pace`
- `slowing pace`
- Other potential end-runs: `strengthening`, `weakening`, `tapering`,
  `fading`, `cooling`, `accelerat` (note: `decelerat` already banned).

Tally per substring → count → list of `(code, dimension)` tuples.

### Audit log

#### 2026-05-10 — first audit (v5 cohort, post-locale ship)

Note: v4 → v5 (2026-05-10, commit `3efe017` + #14/#15/#16) was a
**locale** bump (added `en` + `zh` prompts, locale-suffixed cache
keys `v5-en` / `v5-zh`). It did NOT add `pace`-family bans.
`FORBIDDEN_BASE` is unchanged from v4. Audit cohort is the live v5
cache, both locales.

Live cache today: 5 rows × 4 dims × 2 locales = 40 prose cells.

| Locale | Substring | Where |
|--------|-----------|-------|
| `v5-en` | `pace of` | `US.ANET / technical` ("pace of decline possibly slowing") |
| `v5-zh` | `节奏` + `放缓` | `US.INTC / technical` ("上行节奏或有所放缓") |
| `v5-zh` | (no banned stem hit; flagged as pace-adjacent) | `US.ANET / technical` ("下跌速度较快") |

**3 leaks total, all in `technical` dimension.** Zero leaks in
`fundamentals`, `news`, `sentiment` across either locale. Same
structural pattern as the 2026-05-08 v4 first-build audit — the
technical analyst prompt invites trend-pace characterization
regardless of locale.

End-run substrings checked, none observed: `strengthening`,
`weakening`, `tapering`, `fading`, `cooling`, `accelerat`,
`pace reduction`, `losing pace`, `easing pace`, `slowing pace`.
Chinese end-runs checked, none observed beyond above:
`减速`, `加速`, `动能`, `势头`, `走强`, `走弱`, `降温`, `升温`,
`转弱`, `转强`, `趋缓`.

Per threshold (≤3 leaks across ≤1 dimension): **HOLD at v5.**
No ban-list change. No version bump.

#### 2026-05-10 — second audit (single-stem rescan, pre-source-edit)

Compound-substring scan was too narrow. Re-running with single-word
stems (`easing`, `slowing`, `pace`, `节奏`, `企稳`, `回落`) revealed
the live v5 cohort had **6 leaks**, not 3:

- `v5-en / US.MU / technical`: "rate-of-change potentially easing"
- `v5-en / US.ANET / technical`: "pace of decline possibly slowing"
- `v5-en / US.INTC / technical`: "price rising at a pace that may
  face friction ahead" — also forward-looking
- `v5-zh / US.INTC / technical`: "上行节奏或有所放缓"
- `v5-zh / US.ANET / technical`: "下跌速度较快，或有企稳迹象"
- `v5-zh / US.NBIS / technical`: "价格自 May 8 起小幅回落"

All still confined to `technical` dim, both locales.
Decision: ship source-edit immediately rather than wait for 2026-05-15.

#### 2026-05-10 — v5 → v6 source-edit (post-rebuild audit)

Edited `_PROMPT_TEMPLATE_EN` and `_PROMPT_TEMPLATE_ZH` in
`src/api/analysts/_base.py`. Two new bad/good pairs added after the
existing magnitude pair:

1. Pace-language: "describe what the price did, not whether the move
   is accelerating, decelerating, slowing, or easing"
2. Forward-look: "do not state forward-looking expectations, stick to
   what has happened"

`_PROMPT_VERSION` bumped v5 → v6 in `src/api/digest.py`.
`FORBIDDEN_BASE` unchanged (no ban-list growth).

Cold rebuild ~70s combined (v6-en 37.6s + v6-zh 28.7s).
Pre-existing retries fired on `sell`/`add`/`卖出` — none on pace
family. Post-rebuild scan across all 4 dims × both locales × all
12 single-word stems: **zero leaks**.

Side-by-side replacements (all 6 prior leaks):

| Locale | Code/Dim | v5 prose | v6 prose |
|---|---|---|---|
| en | MU/T | "rate-of-change potentially easing" | "price climbing across recent sessions" |
| en | ANET/T | "pace of decline possibly slowing" | "price trending lower across recent sessions" |
| en | INTC/T | "price rising at a pace that may face friction ahead" | "price near its recent high across the observed period" |
| zh | INTC/T | "上行节奏或有所放缓" | "当前价格接近近期高位区间" |
| zh | ANET/T | "下跌速度较快，或有企稳迹象" | "近期价格持续收低" |
| zh | NBIS/T | "价格自 May 8 起小幅回落" | "价格自 May 8 起连续收低" |

All replacements report what price did rather than characterize
trend speed. Source-edit confirmed effective without needing
substring bans on `pace` / `节奏`. Plan recommendation
(source-edit > ban-list growth) validated.

#### 2026-05-15 — re-audit (one week post-v6 ship) [TBD]

Decision threshold (reframed for v6 cohort):

- **Hold at v6** if cumulative `pace`-family leaks remain ≤3 across
  ≤1 dimension.
- **Bump v6 → v7** only if a new end-run pattern emerges that the
  template's bad/good pairs don't cover. Substring ban on
  `pace` / `节奏` remains the last-resort lever.

If 2026-05-15 audit shows 0 leaks: declare prompt stable, retire
the watch log to `bin/`. If new leak class emerges, extend the
bad/good pairs again before touching `FORBIDDEN_BASE`.

---

## Related shipped follow-ups

- PR #11 (`fix/warm-cache-retry`) — `warm_cache` retry-with-backoff
  for OpenD settling. Closes 2026-05-08 backlog item #2.
- PR #12 (`fix/benchmark-chart-hydration`) — round benchmark-chart
  SVG floats to 4dp. Closes 2026-05-08 backlog item #4.

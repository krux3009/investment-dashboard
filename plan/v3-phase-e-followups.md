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

#### 2026-05-15 — re-audit (one week post-v5 ship) [TBD]

Decision threshold (reframed for v5 cohort):

- **Hold at v5** if cumulative `pace`-family leaks remain ≤3 across
  ≤1 dimension (still concentrated only in `technical`).
- **Bump v5 → v6** if either:
  - ≥3 fresh leaks on tiles built between 2026-05-10 and 2026-05-15
    AND ≥2 dimensions affected, OR
  - any new end-run substring listed above appears in either locale.

**Prefer source-edit over ban-list growth.** If bump is warranted,
first try extending the `_PROMPT_TEMPLATE_EN` / `_PROMPT_TEMPLATE_ZH`
in `src/api/analysts/_base.py` with a second bad/good pair targeting
pace-language directly:

- Bad: "30-day pace of decline slowing"
- Good: "30-day change is -3.79%"

Source-edit reaches all four analyst roles uniformly and closes the
end-run at the prompt rather than via blacklist proliferation.
Substring bans like `pace` / `节奏` over-block neutral phrasing
(`at this pace`, `set the pace`, `节奏稳定`) — acceptable but
inferior to a clearer prompt. Only fall back to ban-list growth
if source-edit doesn't move the leak rate after one full rebuild.

---

## Related shipped follow-ups

- PR #11 (`fix/warm-cache-retry`) — `warm_cache` retry-with-backoff
  for OpenD settling. Closes 2026-05-08 backlog item #2.
- PR #12 (`fix/benchmark-chart-hydration`) — round benchmark-chart
  SVG floats to 4dp. Closes 2026-05-08 backlog item #4.

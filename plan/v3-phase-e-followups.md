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

#### 2026-05-10 — first audit (2 days post-v4 ship)

| Substring        | Count | Where                              |
|------------------|-------|------------------------------------|
| `pace reduction` | 1     | `US.MU / technical`                |
| `losing pace`    | 1     | `US.INTC / technical`              |
| `pace of`        | 1     | `US.ANET / technical` ("pace of decline") |
| Other end-runs   | 0     | none observed                      |

All 3 leaks confined to `technical` dimension. Zero leaks in
`fundamentals`, `news`, `sentiment`. Pattern: technical analyst
appears to be the prompt that invites pace-language.

#### 2026-05-15 — re-audit (one week post-v4 ship) [TBD]

Decision threshold:

- **Hold at v4** if cumulative `pace`-family leaks are ≤3 across
  ≤1 dimension (i.e. still concentrated only in `technical`).
- **Bump v4 → v5** if either:
  - ≥3 fresh leaks (i.e. on tiles built between 2026-05-10 and
    2026-05-15) AND ≥2 dimensions affected, OR
  - any new end-run substring (`strengthening`, `weakening`,
    `tapering`, `fading`, `cooling`) appears.

If bumping: add `pace` (stem) to `FORBIDDEN_BASE`. Note that this
also blocks the neutral phrases `at this pace`, `set the pace`,
`fast pace` — acceptable cost since Claude rarely uses them in
financial-analyst register and the bans are substring-based.
Investigate whether the technical analyst prompt itself can be
edited to avoid pace-language at the source rather than via the
ban-list.

---

## Related shipped follow-ups

- PR #11 (`fix/warm-cache-retry`) — `warm_cache` retry-with-backoff
  for OpenD settling. Closes 2026-05-08 backlog item #2.
- PR #12 (`fix/benchmark-chart-hydration`) — round benchmark-chart
  SVG floats to 4dp. Closes 2026-05-08 backlog item #4.

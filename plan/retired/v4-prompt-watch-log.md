# v4 prompt watch log [RETIRED 2026-05-11]

Tracked substring-leak audits of `digest_tiles_cache` after each
`_PROMPT_VERSION` bump between v3 and v6. Retired on 2026-05-11
after the v6 source-edit fix held through its first audit window
with zero substantive leaks.

**Outcome:** v6 declared stable. The bad/good-pair source-edit
approach in `src/api/analysts/_base.py` proved more effective than
growing `FORBIDDEN_BASE`. Pattern preserved here as a playbook for
future prompt iterations.

---

## Background

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

## Audit method

Run from repo root:

```bash
duckdb data/prices.duckdb \
  "SELECT code, fundamentals, news, sentiment, technical
   FROM digest_tiles_cache WHERE prompt_version='v4'
   ORDER BY code"
```

(Or via Python `duckdb.connect(..., read_only=True)` when the
FastAPI process is running — direct CLI access fights the writer
lock.)

Substrings to check (case-insensitive across all four prose columns):

- `pace reduction`
- `losing pace`
- `pace of`
- `easing pace`
- `slowing pace`
- Other potential end-runs: `strengthening`, `weakening`, `tapering`,
  `fading`, `cooling`, `accelerat` (note: `decelerat` already banned).

Tally per substring → count → list of `(code, dimension)` tuples.

## Audit log

### 2026-05-10 — first audit (v5 cohort, post-locale ship)

Note: v4 → v5 (2026-05-10, commit `3efe017` + #14/#15/#16) was a
**locale** bump (added `en` + `zh` prompts, locale-suffixed cache
keys `v5-en` / `v5-zh`). It did NOT add `pace`-family bans.
`FORBIDDEN_BASE` is unchanged from v4. Audit cohort is the live v5
cache, both locales.

Live cache at audit time: 5 rows × 4 dims × 2 locales = 40 prose cells.

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

### 2026-05-10 — second audit (single-stem rescan, pre-source-edit)

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

### 2026-05-10 — v5 → v6 source-edit (post-rebuild audit)

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

### 2026-05-11 — re-audit (1 day post-v6 ship, early)

Ran the 2026-05-15 audit 4 days early. Same cohort scanned:
5 codes × 4 dims × 2 locales = 40 prose cells (v6-en + v6-zh).

Pattern scan covered:

- Pace family (EN): `pace`, `easing`, `slowing`, `accelerat`,
  `decelerat`, `momentum`, `mover`, `tapering`, `fading`, `cooling`,
  `strengthening`, `weakening`, `rate-of-change`
- Pace family (ZH): `节奏`, `放缓`, `减速`, `加速`, `动能`, `势头`,
  `走强`, `走弱`, `降温`, `升温`, `转弱`, `转强`, `趋缓`
- Forward-look (EN): `may \w+`, `could \w+`, `will \w+`,
  `should \w+`, `expected to`, `set to`, `poised`, `ahead`
- Forward-look (ZH): `预计`, `或将`, `可能`, `料`, `看涨`, `看跌`,
  `即将`, `有望`, `后续`

Raw hits: 5 (1 × `ahead`, 4 × `may \w+`). All five are false
positives — `ahead` matched `"ahead of April CPI and PPI"` (calendar
context for macro releases, not a forward-look about the stock);
`may` matched `"May 13"`, `"May 8"`, `"May 6"`, `"May price"` (the
month name).

Substantive leaks: **0**.

Visual scan of all 40 cells confirmed: technical prose now consistently
descriptive ("price trending lower / climbing / near recent high /
trended lower from May 8 after a brief upward shift on May 6"), no
trend-speed characterization, no forward-look predictions about
holdings.

Decision: **prompt stable at v6.** Source-edit fix held through the
first audit window. No bump needed. Watch log retired to
`plan/retired/`.

False-positive lesson: substring scans drag in calendar context and
month names. Next prompt audit, prefer whole-phrase patterns
(`may face`, `set to`, `poised to`, `expected to`) over single-word
stems for the forward-look class.

## Lessons preserved for future prompt work

1. **Source-edit > ban-list growth.** Pace-language and forward-look
   are *patterns* not *words*. Adding bad/good example pairs to the
   prompt template communicates the pattern at the right level of
   abstraction. Substring bans on words like `pace` would over-block
   neutral phrasing (`at this pace`, `set the pace`, `节奏稳定`).
2. **Compound substring scans miss single-stem end-runs.** Claude
   reaches for the standalone form (`easing`, `slowing`) as often as
   the compound (`easing pace`). Always run single-stem scans alongside
   compound ones.
3. **Whole-phrase patterns beat substring patterns for false-positive
   load.** A month name (`May`) and a modal verb (`may`) collide in
   English; calendar context (`ahead of CPI`) and predictions about
   stocks (`may face friction ahead`) share keywords. Use
   `\b(may|could|will|should)\s+(face|see|reach|test|break|hold|extend|continue)\b`
   style patterns for forward-look class instead of bare modals.
4. **Locale bumps invalidate `prompt_version` cache rows but don't
   delete them.** Stale rows from before a bump remain queryable but
   are never served. Set a periodic cache cleanup hygiene step if the
   table grows past a comfortable size.
5. **Audit timeline.** First audit ~1 day post-bump (verifies the fix
   landed cleanly), second audit ~1 week post-bump (confirms stability
   under more cold-rebuild variance). If both come back zero, retire
   the watch log.

## Decision threshold (kept for future prompt bumps)

For any new `_PROMPT_VERSION` audit cycle:

- **Hold at current version** if substantive leaks ≤3 across ≤1
  dimension after both audit windows.
- **Iterate** (extend bad/good pairs in `_base.py`) if a fresh
  pattern emerges that existing pairs don't cover.
- **Substring ban** (`FORBIDDEN_BASE` growth) is the last resort —
  only when a specific word, not a pattern, is the leak vector.

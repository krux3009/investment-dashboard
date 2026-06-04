# v3 Phase E — follow-ups after Phase D + foresight + D5

Cleanup / monitoring work tracked here after the main v3 milestones
(Phase A through D5 + foresight) shipped. Each entry is small-scope —
parked when not urgent, executed when promoted to a session backlog.

---

## v4 prompt watch log → retired 2026-05-11

Watch log tracked substring-leak audits across `_PROMPT_VERSION`
bumps v3 → v6. Closed out 2026-05-11 after v6 (source-edit fix in
`src/api/analysts/_base.py`) held through its first audit window
with zero substantive leaks. Full audit history + lessons preserved
at [`retired/v4-prompt-watch-log.md`](./retired/v4-prompt-watch-log.md).

Active prompt is v6. Next audit cycle only opens if a future bump
ships.

---

## DESIGN doc re-capture

- ✅ **#2 DESIGN.md v4 re-capture** (2026-06-04). Typography (added
  IBM Plex Serif display type + Sans-working/Serif-display rule),
  Elevation (reconciled the `rounded-xl` shadowless SWS cards), and
  Components (portfolio 6-tab architecture + snowflake / kpi-tile /
  statement-card / comparison-gauge / dividend-ledger / performance-
  chart / calendar / returns primitives) brought current with the
  shipped v4 SWS surface. Frontmatter gained the serif role, extended
  `rounded` scale, and the new component tokens. CLAUDE.md refreshed
  alongside (Architecture tree, Surfaces, advisor endpoints + prompt
  versions, Verification).
- ✅ **DESIGN.json sidecar re-sync** (2026-06-04). Hand-synced to the
  v4 DESIGN.md: display-serif typographyMeta role, Sans-working/
  Serif-display + Shadowless-Card rules, refreshed No-Floating-Cards +
  Hand-Rolled-SVG, narrative/keyCharacteristics/dos/donts, fixed nav
  (locale toggle + 2-state theme) + notes-focus (gold) specimens, and
  six new v4 component specimens (SWS card, portfolio tab strip,
  snowflake radar, statement card, KPI tile/strip, comparison gauge).
  Color tonal ramps left as the 2026-05-13 captures (neutrals unchanged).
- ✅ **#5 Playwright baselines — diff-verified, no re-baseline (2026-06-04).**
  Captured all 11 dark-mode full-page screenshots (home + 6 portfolio
  tabs + watchlist @ 1440/768) to scratch and pixel-diffed against the
  committed `.playwright/baseline/` set. Diffs were small (meanΔ
  0.7–6.8/255, 0.7–5.6% px) and entirely **data-shaped** — the SIMULATE
  book grew 5→6 holdings (delisted US.DRAM added), live values + the
  digest date changed. Side-by-side composites confirmed structure
  (serif h1, gold accent, snowflake, KPI strip, register, concentration
  bars, dark theme) is identical. Baselines left untouched on purpose:
  re-capturing would bake the transient simulate book + DRAM into the
  reference set. Re-shoot only after a real visual/design change ships,
  ideally against a clean book with OpenD quote ctx healthy (snapshot
  was flapping `ret=-1` during this run, so SSE live ticks were stale).

## Related shipped follow-ups

- PR #11 (`fix/warm-cache-retry`) — `warm_cache` retry-with-backoff
  for OpenD settling. Closes 2026-05-08 backlog item #2.
- PR #12 (`fix/benchmark-chart-hydration`) — round benchmark-chart
  SVG floats to 4dp. Closes 2026-05-08 backlog item #4.

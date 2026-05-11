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

## Related shipped follow-ups

- PR #11 (`fix/warm-cache-retry`) — `warm_cache` retry-with-backoff
  for OpenD settling. Closes 2026-05-08 backlog item #2.
- PR #12 (`fix/benchmark-chart-hydration`) — round benchmark-chart
  SVG floats to 4dp. Closes 2026-05-08 backlog item #4.

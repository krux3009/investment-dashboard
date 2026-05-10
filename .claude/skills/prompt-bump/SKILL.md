---
name: prompt-bump
description: Bump _PROMPT_VERSION in a Claude advisor module and invalidate stale DuckDB cache rows. Use when the user edits prompt copy, system prompt, FORBIDDEN list, output schema, or temperature/max_tokens in any src/api/*.py module that defines _PROMPT_VERSION. Also use after changing the i18n locale handling for a prompt.
---

# prompt-bump

Six advisor modules carry `_PROMPT_VERSION` constants. Cached prose lives in DuckDB keyed on `(dimension, _PROMPT_VERSION)` (often suffixed by locale via `prompt_version_with_locale`). Editing the prompt without bumping the version → stale cached prose served forever.

## Modules under management

Run this to enumerate (paths relative to repo root):

```bash
grep -rn '^_PROMPT_VERSION' src/api/ | sort
```

Known surfaces (snapshot — re-grep before acting):

| Module | Cache table (DuckDB) | Locale-aware |
|---|---|---|
| `src/api/digest.py` | `digest_cache` | yes |
| `src/api/insight.py` | `insight_cache` | yes |
| `src/api/benchmark_insight.py` | `benchmark_insight_cache` | yes |
| `src/api/concentration_insight.py` | `concentration_insight_cache` | yes |
| `src/api/foresight_insight.py` | `foresight_insight_cache` | yes |
| `src/api/company_events.py` | `company_events_cache` | check `prompt_version_with_locale` usage |
| `src/api/sentiment_insight.py` | `sentiment_insight_cache` | yes |
| `src/api/anomaly_translator.py` | inline cache | yes |
| `src/api/analysts/*.py` | `analyst_tile_cache` | yes |

Treat the table above as a starting hint. Verify the actual table name by reading the module's `CREATE TABLE` / `INSERT INTO` statements before running any DELETE.

## Workflow

1. **Identify the module the user just edited.** If unclear, ask which one.
2. **Read the current `_PROMPT_VERSION` value.** Note the convention used in that file (e.g. `"v3-no-em-dash"`, `"v5"`, `"v1"`).
3. **Propose the next version label.** Mirror the existing pattern. Add a one-token suffix describing what changed if the file already uses suffix-style versions (e.g. `v4-no-em-dash` → `v5-watch-line-tighter`).
4. **Show the user the proposed bump and the inline comment to add above the constant.** Comments in this codebase document each version transition (see `digest.py` lines 43-47 for the format). Wait for confirmation before editing.
5. **Edit the constant.** Append a new comment line in the same style:
   ```
   # vN → vN+1 (YYYY-MM-DD): <one-line reason>
   ```
6. **Invalidate the old cache row.** Use Python (no duckdb CLI installed):
   ```bash
   uv run python -c "
   import duckdb
   con = duckdb.connect('data/prices.duckdb')
   # Replace TABLE and OLD_VERSION below
   con.execute(\"DELETE FROM <TABLE> WHERE prompt_version LIKE '<OLD_VERSION>%'\")
   con.commit()
   con.close()
   "
   ```
   Use `LIKE '<old>%'` because locale suffix (`-en`, `-zh`) is appended at runtime.
7. **Confirm DuckDB write is safe.** If `uvicorn` is running, the cache write will collide with the API process. Either ask the user to stop the server first, or use the API to invalidate (no current endpoint — recommend stopping uvicorn).

## Guardrails

- Never bump multiple modules in one pass without explicit confirmation per module — version bumps cascade through the UI's `[learn more]` toggles and users may want to roll one at a time.
- If the prompt edit only touched comments, whitespace, or unused branches, recommend skipping the bump.
- If the user changed `FORBIDDEN_BASE` in `_base.py`, every dependent analyst tile module needs a bump — flag this explicitly.
- Always show the `git diff` of the prompt change before bumping so the user can confirm the change is real.

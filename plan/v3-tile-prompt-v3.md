# Plan — Tile prompt v2 → v3 (drop highlight phrasing)

## Context

The 2026-05-06 session shipped v3 analyst tiles (PR #4, commit `cd7e2c8`):
4 Claude-generated sentences per ticker (Fundamentals / News / Sentiment /
Technical) on the home page.

First-build outputs read mostly fine but lean marketing-y in places. Sample
flagged in the session recap (`sessions/2026-05-06.md:321–324`):

> "Price action shows mixed directional signals on May 5, while the 30-day
> change **registers a notable 45% gain**."

Words like *notable*, *registers*, *mixed*, *significant*, *robust* are
subjective magnitude qualifiers — the model fills them in to sound
analytical even though the prompt asks for observation-only framing.

Goal: tighten `_PROMPT_TEMPLATE` + `FORBIDDEN_BASE` so the model reports
the number and stops there. Bump `_PROMPT_VERSION` "v2" → "v3" so the
DuckDB cache invalidates cleanly on next request. No schema change, no
frontend change, no new tests.

## Scope

Single-PR diff. Two files edited, ≈30 line change total.

## Files

| File | Change |
|------|--------|
| `src/api/analysts/_base.py:30–35` | Extend `FORBIDDEN_BASE` with magnitude/highlight qualifiers. |
| `src/api/analysts/_base.py:66–82` | Edit `_PROMPT_TEMPLATE`: add "report numbers, don't characterize" line + one bad/good example. |
| `src/api/digest.py:43` | `_PROMPT_VERSION = "v2"` → `"v3"`. |

No edits to: tile modules (per-role bans stay), `digest_tiles_cache` schema,
`web/src/components/daily-digest.tsx`, `api.ts` types.

## Approach

### 1. Extend `FORBIDDEN_BASE`

Add magnitude qualifiers + evaluative verbs that read as analyst-color:

```python
FORBIDDEN_BASE: tuple[str, ...] = (
    # Action verbs (existing)
    "buy", "sell", "hold", "trim", "add", "target", "forecast",
    "predict", "expect", "recommend", "should", "ought",
    # Direction verbs (existing)
    "surge", "plunge", "soar", "crash", "breakout", "rally", "tank",
    "bullish", "bearish",
    # Magnitude qualifiers (NEW in v3)
    "notable", "notably", "significant", "significantly",
    "remarkable", "remarkably", "impressive", "impressively",
    "strong", "weak", "robust", "solid", "sharp", "stark",
    "dramatic", "dramatically", "modest", "outsized", "massive",
    # Highlight verbs (NEW in v3)
    "registers", "boasts", "showcases", "demonstrates", "highlights",
)
```

Rationale: the existing list bans *direction with intent* ("rally / surge")
but not *magnitude descriptors* ("notable / significant / sharp"). The
sample failure ("registers a notable 45% gain") slips through the action-verb
filter entirely because *notable* and *registers* aren't direction-loaded.

Keep "mixed" out of the ban list — it's genuinely useful for "30D was up,
60D was down" style descriptions. Address that via the template instruction
instead (numbers, not adjectives).

### 2. Edit `_PROMPT_TEMPLATE`

Add one line and one example pair after the "Forbidden words" line:

```python
_PROMPT_TEMPLATE = """\
You are the {role} analyst on a long-horizon investor's reading desk for
{ticker} ({name}). Write ONE sentence about today's {role_lower} signals
for this stock. Plain English, ≤22 words. Frame as observation only.

Forbidden words (anywhere in your output): {forbidden_csv}.

Report numbers as numbers. Do not characterize their magnitude.
Bad: "registers a notable 45% gain"
Good: "30-day change is +45%"

NEVER use em dashes (—). Use colons, commas, or periods.

If the context below is empty or all-null, output exactly:
"Quiet on {role_lower} this week."

Output: just the sentence. No preamble, no quotes, no markdown.

Context:
{context_json}
"""
```

The example pair is the cheapest way to teach the model "describe ≠
characterize" — one-shot in-prompt examples reliably steer phrasing in
my prior digest experiments. Total prompt overhead: ~50 tokens per call.
With ≤16 concurrent + 6h cache, negligible.

### 3. Bump `_PROMPT_VERSION`

`src/api/digest.py:43`:

```python
_PROMPT_VERSION = "v3"  # was "v2"
```

Cache key is `(code, prompt_version)` (verified `digest.py:158, 170–172`).
Bumping the version makes the next `/api/digest` call miss the v2 rows
and write fresh v3 rows. Old rows stay in the table as harmless residue,
same as the `digest_cache → digest_tiles_cache` migration in PR #4.

## Verification

End-to-end smoke after editing:

```bash
# 1. Backend reloads automatically (uvicorn --reload watches src/).
#    No manual restart needed.

# 2. Force a cache miss to regenerate all 5 tickers × 4 tiles fresh.
curl -s 'http://localhost:8000/api/digest?refresh=true' | jq -r '
  .tickers[] | "\(.code):\n  F: \(.fundamentals)\n  N: \(.news)\n  S: \(.sentiment)\n  T: \(.technical)\n"
'

# 3. Visual check — no occurrences of the new forbidden words:
curl -s 'http://localhost:8000/api/digest' | jq -r '
  .tickers[] | .fundamentals, .news, .sentiment, .technical
' | grep -iE 'notable|notably|significant|registers|boasts|robust|sharp|dramatic'
# Expected: no matches.

# 4. Confirm cache key invalidated.
duckdb data/prices.duckdb -c \
  "SELECT prompt_version, count(*) FROM digest_tiles_cache GROUP BY 1"
# Expected: rows for both 'v2' (stale) AND 'v3' (fresh) after step 2.

# 5. Browser eyeball — http://localhost:3000/ — tile sentences should
#    read more declarative, less analyst-color. If any tile still says
#    "notable" / "significant" the forbidden-words guard hasn't fired
#    (check `_has_forbidden` regex in `_base.py`).
```

If outputs still feel marketing-y after step 2, iterate the template +
bump to "v4". Cache invalidation is cheap.

## Risks

- **One-shot example bias.** Adding "30-day change is +45%" as the *good*
  example might bias every Technical tile toward leading with a percentage
  — fine for Technical, weird if Fundamentals copies the pattern. Mitigate
  by phrasing the good example more generically if it shows up:
  `Good: "P/E ratio is 28x; revenue grew 12% year-over-year"` rotated per
  role. Skip for v3 — single example first, see if the bias is real.
- **Forbidden-words false positives.** "Strong" appearing in a quoted
  source name (e.g., "Bank of America strong-sell list") would trip the
  filter. Tile context is structured JSON so unlikely, but worth noting
  if we see legitimate words quieted.
- **Quiet fallback rate.** Adding ~25 forbidden words tightens the filter;
  one retry then fallback is the path. If the retry rate spikes (visible
  via Anthropic dashboard cost), back off some words. Watch for ~1 day.

## Out of scope (per session backlog)

- Quiet-row collapse (item 1 from session recap) — defer until v3 cache
  populates and we see real outputs.
- Pytest harness (item 6) — separate plan, larger scope.
- Async-warm cache lifespan task (item 2) — separate plan.
- Per-row tick pulse refactor (D5 carryover) — separate plan.

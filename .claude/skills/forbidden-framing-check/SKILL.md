---
name: forbidden-framing-check
description: Audit a Claude advisor module (or new prose surface) for FORBIDDEN_BASE compliance, surface-specific ban extensions, and Watch-line wording rules. Use after creating or editing src/api/*_insight.py, src/api/digest.py, src/api/anomaly_translator.py, src/api/foresight_insight.py, or src/api/analysts/*.py. Also use when the user asks to "check the financial framing" of any Claude prose surface.
---

# forbidden-framing-check

The dashboard's hard rule: every Claude-generated surface must be educational, observational, never directive. The full ruleset lives at `~/.claude/projects/-Users-tanlixuan-Me-Vault/memory/feedback_financial_framing.md` (referenced from `CLAUDE.md`).

## Source of truth

`src/api/analysts/_base.py::FORBIDDEN_BASE` defines the universal ban list. `src/api/digest.py` carries the canonical version with magnitude qualifiers and indicator-behavior tokens added across v2→v5.

```bash
# Always re-read these before auditing — they evolve.
grep -A 200 '^FORBIDDEN_BASE' src/api/analysts/_base.py
grep -A 200 '^FORBIDDEN' src/api/digest.py
```

## Surface-specific extensions (snapshot)

| Surface | Must additionally ban |
|---|---|
| `concentration_insight.py` | rebalance, diversify, over-weight, under-weight |
| `benchmark_insight.py` | alpha, beta, outperform, underperform |
| `foresight_insight.py` | predict, expect, forecast, will, anticipate |
| `analysts/fundamentals.py` | cheap, expensive, undervalued, overvalued |
| `analysts/technical.py` | support, resistance (when used predictively) |

Re-confirm the list by reading each module's local `_FORBIDDEN_EXTRA` (or equivalent) constant before flagging.

## Audit checklist

For the target module:

1. **Imports `FORBIDDEN_BASE`?** If not, the module is bypassing the universal ban list — flag.
2. **Extends `FORBIDDEN_BASE` with the surface-specific bans listed above?** Diff the union against the table.
3. **Locale coverage.** Does the module register CN forbidden tokens too? (zh prompts are gated separately — see `digest.py` v4→v5 transition.)
4. **Output schema.** Every surface emits `What / Meaning / Watch`. Confirm:
   - **What** is descriptive, present-tense, no action verbs.
   - **Meaning** explains mechanism, no future-tense claims.
   - **Watch** names an *observation target* (e.g. "next earnings call commentary on margins"), never an *action* ("consider trimming").
5. **System prompt forbids buy/sell/hold/trim/add/target/recommend** + hype words (rally, surge, soar, crash, plunge, rocket).
6. **Run a sample prompt and grep the output.** If `ANTHROPIC_API_KEY` is set, hit the corresponding endpoint (`/api/insight/<code>`, `/api/concentration-insight`, etc.) with a fresh cache key, then run:
   ```bash
   curl -s 'http://127.0.0.1:8000/api/insight/US.NVDA' | jq -r '.what,.meaning,.watch' | \
     grep -iE 'buy|sell|hold|trim|add|target|recommend|expect|forecast|predict|rally|surge|soar|crash|alpha|beta|cheap|expensive|undervalued|overvalued|rebalance|diversify' \
     && echo 'FAIL: forbidden tokens present' || echo 'PASS'
   ```
7. **Cache key includes `_PROMPT_VERSION`.** If you tightened the ban list, the version must bump (see `prompt-bump` skill).

## Output format

Report findings as a table:

```
| Surface | Check | Status | Note |
|---|---|---|---|
| insight.py | imports FORBIDDEN_BASE | PASS | |
| insight.py | extends with surface bans | FAIL | missing 'rally','surge' |
| insight.py | Watch line names target | PASS | |
```

Stop after listing findings. Do not auto-fix without confirmation — wording changes are sensitive and the user maintains the canonical voice.

---
name: forbidden-framing-check
description: Audit a Claude advisor module for the recommendation-era framing — anti-hype (FORBIDDEN_HYPE) compliance, grounding, and that the per-stock surface carries Action/Why/Confidence/Risk. Use after creating or editing src/api/*_insight.py, src/api/insight.py, src/api/digest.py, src/api/anomaly_translator.py, src/api/snowflake.py, or src/api/analysts/*.py. Also use when the user asks to "check the financial framing" of a Claude prose surface.
---

# forbidden-framing-check (recommendation era)

**Reversed 2026-06-06.** The dashboard dropped its educational-only guardrail. Advisor surfaces now give a direct, actionable view (buy/sell/trim/add/target/rebalance/cheap/expensive are ALLOWED). This skill no longer flags action language — it audits that prose stays calm, grounded, and free of hype. Full context: `project_recommendation_framing` memory + `~/.claude/projects/-Users-tanlixuan-Me-Vault/memory/feedback_financial_framing.md`.

## Source of truth

`src/api/_advisor_guard.py::FORBIDDEN_HYPE` is the universal (and only) post-check ban list — pump/hype words in en + zh. Each advisor should set its `_BANS = FORBIDDEN_HYPE` (or, for `analysts/_base.py`, `FORBIDDEN_BASE = FORBIDDEN_HYPE["en"]`).

```bash
# Re-read before auditing — it evolves.
grep -A 30 '^FORBIDDEN_HYPE' src/api/_advisor_guard.py
```

## Audit checklist

For the target module:

1. **Post-check uses `FORBIDDEN_HYPE`?** The module's `_BANS` (or `_STATEMENT_BANS_*`, or `_base.FORBIDDEN_BASE`) should equal the hype list, NOT the old action/magnitude/pace bans. If it still bans buy/sell/trim/add/target/forecast/recommend/alpha/beta/rebalance/cheap/expensive → flag (stale guardrail).
2. **Retry suffix.** If it post-checks, it should use `RETRY_SUFFIX_HYPE_EN/ZH`, not the old `RETRY_SUFFIX_EN/ZH`.
3. **No stale guardrail prose.** Grep the system prompt for leftover "observation only", "never recommend", "Watch names an observation target never an action", "do not give advice", "do not predict", magnitude/pace/forward-look bans → flag for removal.
4. **Grounding (per-stock recommendation only).** `insight.py` must instruct: recommend only from the signals passed; thin/conflicting signals → Hold/Watch + Low confidence. Confirm the output carries **Action / Why / Confidence / Risk** and the route serializes all four.
5. **Calm tone preserved.** Em-dash ban kept; plain-English/beginner guidance kept; `_PROMPT_VERSION` ends in `-recommend` (or was bumped after the edit).
6. **Live hype grep.** If `ANTHROPIC_API_KEY` is set, hit the endpoint with a fresh cache key and confirm NO hype tokens:
   ```bash
   curl -s 'http://127.0.0.1:8000/api/insight/US.NVDA' | jq -r '.action,.why,.confidence,.risk' | \
     grep -iE 'guaranteed|to the moon|can.?t lose|risk-free|no-brainer|yolo|稳赚|必涨|财富自由' \
     && echo 'FAIL: hype tokens present' || echo 'PASS'
   ```
7. **Cache key includes `_PROMPT_VERSION`.** If you changed prompt copy or the ban list, the version must bump (see `prompt-bump`).

## Output format

```
| Surface | Check | Status | Note |
|---|---|---|---|
| insight.py | _BANS = FORBIDDEN_HYPE | PASS | |
| insight.py | Action/Why/Confidence/Risk present | PASS | |
| benchmark_insight.py | no stale guardrail prose | FAIL | still says "observation only" |
```

Stop after listing findings. Do not auto-fix without confirmation — wording changes are sensitive and the user maintains the canonical voice.

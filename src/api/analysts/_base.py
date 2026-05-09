"""Shared Claude-call shape + forbidden-words guard for analyst tiles.

Each analyst module imports `call_analyst` and provides:
  • role label ("Fundamentals" | "News" | "Sentiment" | "Technical")
  • role-specific bans extending FORBIDDEN_BASE
  • a context dict of structured signals (no prose) for that dimension

The shared call enforces:
  • ≤22 word sentence, observation framing
  • Forbidden-words post-validation with one retry
  • Quiet fallback string when context is empty

The same Claude SDK call shape as `api.insight._call_claude`. Reuses
`ANTHROPIC_DIGEST_MODEL` env var.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass

log = logging.getLogger(__name__)


# Mirrors digest.py / insight.py. Action + hype words forbidden across
# every analyst tile.
FORBIDDEN_BASE: tuple[str, ...] = (
    "buy", "sell", "hold", "trim", "add", "target", "forecast",
    "predict", "expect", "recommend", "surge", "plunge", "soar",
    "crash", "breakout", "rally", "tank", "should", "ought",
    "bullish", "bearish",
    # Magnitude qualifiers (v3): describe ≠ characterize.
    "notable", "notably", "significant", "significantly",
    "remarkable", "remarkably", "impressive", "impressively",
    "strong", "weak", "robust", "solid", "sharp", "stark",
    "dramatic", "dramatically", "modest", "outsized", "massive",
    # Highlight verbs (v3).
    "registers", "boasts", "showcases", "demonstrates", "highlights",
    # Indicator-behavior + activity stems (v4): describe the data, don't
    # narrate the indicator. Substring match catches inflections — e.g.
    # "decelerat" covers deceleration / decelerate / decelerating /
    # decelerated; "mover" covers movers / mover.
    "momentum", "decelerat", "mover",
)


@dataclass(frozen=True)
class AnalystOutput:
    sentence: str          # ≤22 words, no forbidden words
    is_quiet: bool         # true when context is empty → "Quiet on X this week"


def _quiet(role: str) -> AnalystOutput:
    return AnalystOutput(
        sentence=f"Quiet on {role.lower()} this week.",
        is_quiet=True,
    )


def _word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def _has_forbidden(text: str, bans: tuple[str, ...]) -> str | None:
    """Return the first banned word found (case-insensitive, substring-aware),
    or None if clean. Substring-aware so 'breakouts' trips on 'breakout'.
    """
    lower = text.lower()
    for word in bans:
        if word.lower() in lower:
            return word
    return None


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


def call_analyst(
    role: str,
    ticker: str,
    name: str,
    context: dict,
    role_specific_bans: tuple[str, ...],
    *,
    is_context_empty: bool,
) -> AnalystOutput:
    """Single Claude call. Returns AnalystOutput.

    On empty context: short-circuits with the quiet fallback (no Claude
    call, no spend). On forbidden-word violation: one retry with a
    stricter system prompt; if still failing, falls back to quiet.
    """
    if is_context_empty:
        return _quiet(role)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/digest."
        )

    bans = FORBIDDEN_BASE + role_specific_bans
    prompt = _PROMPT_TEMPLATE.format(
        role=role,
        role_lower=role.lower(),
        ticker=ticker,
        name=name,
        forbidden_csv=", ".join(bans),
        context_json=json.dumps(context, indent=2, default=str),
    )

    sentence = _claude_one_shot(prompt, max_tokens=120)
    bad = _has_forbidden(sentence, bans)
    if bad is not None:
        log.info("analyst %s/%s: forbidden word %r in first draft, retrying", role, ticker, bad)
        retry_prompt = (
            prompt
            + "\n\nIMPORTANT: your previous draft used the forbidden word "
            f'"{bad}". Rewrite without it. Plain observational language only.'
        )
        sentence = _claude_one_shot(retry_prompt, max_tokens=120)
        bad = _has_forbidden(sentence, bans)
        if bad is not None:
            log.warning("analyst %s/%s: forbidden word %r persisted after retry; quieting", role, ticker, bad)
            return _quiet(role)

    if _word_count(sentence) > 28:
        log.info("analyst %s/%s: sentence over budget (%d words), keeping", role, ticker, _word_count(sentence))

    return AnalystOutput(sentence=sentence, is_quiet=False)


def _claude_one_shot(prompt: str, *, max_tokens: int) -> str:
    from anthropic import Anthropic

    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    parts = [b.text for b in response.content if b.type == "text"]
    return "\n".join(parts).strip().strip('"').strip("'")

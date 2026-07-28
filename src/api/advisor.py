"""Shared engine for every Claude advisor surface.

One place owns: API-key precondition, Anthropic client + model
resolution, the anti-hype guard with its single retry, and the
`kv_<surface>` JSON cache keyed on `key|prompt_version-locale`.
Each surface module keeps only what is genuinely its own — the data
gathering, the prompt copy, its parse shape, and its quiet fallback.

Contract of `complete()`:
  • raises RuntimeError when ANTHROPIC_API_KEY is missing (routes map
    this to 503; surfaces that prefer to degrade catch it themselves)
  • returns None when the hype guard still trips after one retry —
    the caller substitutes its own quiet template
  • `client=` is the test seam: pass a fake to exercise a surface
    without the SDK
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Mapping

from api._advisor_guard import (
    FORBIDDEN_HYPE,
    RETRY_SUFFIX_HYPE_EN,
    RETRY_SUFFIX_HYPE_ZH,
    has_forbidden,
)
from api.data import cache
from api.i18n import DEFAULT_LOCALE, Locale, prompt_version_with_locale

log = logging.getLogger(__name__)

_DEFAULT_MODEL = "claude-sonnet-4-6"

# The common What/Meaning/Watch language pair. Surfaces with different
# labels (e.g. insight's Action/Why/Confidence/Risk) override via
# AdvisorSpec.lang_instruction.
WMW_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文回答。所有结构化标签（'What:' / 'Meaning:' / 'Watch:'）保持英文以便解析。"
        "采用零售投资者的朴素中文。可以给出明确、可执行的方向性看法"
        "（例如加仓、减仓、持有或再平衡），但须保持冷静、有据的口吻：不得夸大、保证或断言必然。"
        "\n\nWatch 一行的时间词优先使用 \"下次/下个/未来\"，避免 \"后续\"。\n"
    ),
}


@dataclass(frozen=True)
class AdvisorSpec:
    """Everything the engine needs to run one advisor surface."""

    surface: str  # slug used in cache table name, error text, and logs
    prompt: str
    prompt_version: str
    ttl: timedelta
    max_tokens: int = 400
    lang_instruction: Mapping[Locale, str] | None = None  # None → WMW pair
    bans: Mapping[Locale, tuple[str, ...]] | None = None  # None → FORBIDDEN_HYPE


def _table(spec: AdvisorSpec) -> str:
    return "kv_" + spec.surface.replace("-", "_")


def _full_key(spec: AdvisorSpec, key: str, locale: Locale) -> str:
    return f"{key}|{prompt_version_with_locale(spec.prompt_version, locale)}"


def load(
    spec: AdvisorSpec, key: str, locale: Locale = DEFAULT_LOCALE
) -> tuple[Any, datetime] | None:
    """Cached (payload, generated_at) or None on miss / expiry /
    prompt-version or locale change."""
    return cache.get(_table(spec), _full_key(spec, key, locale), spec.ttl)


def save(
    spec: AdvisorSpec, key: str, payload: Any, locale: Locale = DEFAULT_LOCALE
) -> datetime:
    return cache.put(_table(spec), _full_key(spec, key, locale), payload)


def invalidate(spec: AdvisorSpec) -> None:
    cache.clear(_table(spec))


def complete(
    spec: AdvisorSpec,
    user_message: str,
    locale: Locale = DEFAULT_LOCALE,
    *,
    system: str | None = None,
    client: Any = None,
) -> str | None:
    """One guarded Claude call. See module docstring for the contract."""
    if client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                f"ANTHROPIC_API_KEY not set — add it to .env to enable {spec.surface}."
            )
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)

    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", _DEFAULT_MODEL)
    bans = (spec.bans or FORBIDDEN_HYPE)[locale]
    lang = (spec.lang_instruction or WMW_LANG_INSTRUCTION)[locale]
    system_prompt = (system if system is not None else spec.prompt) + lang

    def _shot(sys_text: str) -> str:
        kwargs: dict[str, Any] = {}
        if sys_text:  # surfaces that pack everything into the user message skip system
            kwargs["system"] = sys_text
        response = client.messages.create(
            model=model,
            max_tokens=spec.max_tokens,
            messages=[{"role": "user", "content": user_message}],
            **kwargs,
        )
        return "\n".join(b.text for b in response.content if b.type == "text").strip()

    body = _shot(system_prompt)
    bad = has_forbidden(body, bans, locale)
    if bad is None:
        return body
    log.info("%s: hype %r in first draft, retrying (locale=%s)", spec.surface, bad, locale)
    retry_suffix = (
        RETRY_SUFFIX_HYPE_ZH if locale == "zh" else RETRY_SUFFIX_HYPE_EN
    ).format(bad=bad)
    body = _shot(system_prompt + retry_suffix)
    bad2 = has_forbidden(body, bans, locale)
    if bad2 is None:
        return body
    log.warning(
        "%s: hype %r persisted after retry, quieting (locale=%s)",
        spec.surface, bad2, locale,
    )
    return None


def parse_wmw(body: str) -> tuple[str, str, str]:
    """Parse the labelled What/Meaning/Watch trio; unparseable bodies
    land whole in the What slot so nothing silently disappears."""
    what = meaning = watch = ""
    for line in body.splitlines():
        line = line.strip()
        lower = line.lower()
        if lower.startswith("what:"):
            what = line.split(":", 1)[1].strip()
        elif lower.startswith("meaning:"):
            meaning = line.split(":", 1)[1].strip()
        elif lower.startswith("watch:"):
            watch = line.split(":", 1)[1].strip()
    if not (what or meaning or watch):
        what = body
    return what, meaning, watch

"""Backend locale plumbing for Claude-prose surfaces.

Single source of truth for the supported locales + Query-param parsing.
Each prose module (digest, insight, *_insight, analysts) accepts a
`locale: Locale` parameter and uses `prompt_version_with_locale()` to
suffix its `_PROMPT_VERSION` constant when reading/writing the cache.

Anomaly translator is a special case: locale="zh" short-circuits and
returns moomoo's raw Chinese text without a Claude call.
"""

from __future__ import annotations

from typing import Literal

Locale = Literal["en", "zh"]
DEFAULT_LOCALE: Locale = "en"
SUPPORTED_LOCALES: tuple[Locale, ...] = ("en", "zh")


def parse_locale(raw: str | None) -> Locale:
    """Validate a Query-param locale string. Falls back to DEFAULT_LOCALE
    on missing / unknown values rather than raising — the dashboard
    should still render in English when the param is malformed.
    """
    if raw is None:
        return DEFAULT_LOCALE
    lower = raw.strip().lower()
    if lower in SUPPORTED_LOCALES:
        return lower  # type: ignore[return-value]
    return DEFAULT_LOCALE


def prompt_version_with_locale(version: str, locale: Locale) -> str:
    """Suffix a module's `_PROMPT_VERSION` with the locale code so the
    cache splits cleanly per language. Pure helper — no module imports.
    """
    return f"{version}-{locale}"

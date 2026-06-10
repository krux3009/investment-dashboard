"""Plain-English commentary on the income ledger.

Advisor pattern: the static endpoint already renders TTM totals + the
stacked-bar SVG; this lazy block adds one What / Meaning / Watch trio
when the user expands. Cache key is the rounded income shape so
identical books hit cache.

Direct, actionable framing (2026-06-06): the dashboard dropped its
educational-only guardrail. The "Watch" line may now carry a concrete,
actionable takeaway. The only surviving post-check ban is a slim
anti-hype guard (`FORBIDDEN_HYPE`) that keeps the Quiet-Ledger tone
calm and grounded — the reader makes the final decision.
"""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import dividends
from api._advisor_guard import (
    FORBIDDEN_HYPE,
    RETRY_SUFFIX_HYPE_EN,
    RETRY_SUFFIX_HYPE_ZH,
    has_forbidden,
)
from api.data import prices
from api.i18n import DEFAULT_LOCALE, Locale, prompt_version_with_locale

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
# v1-no-em-dash (educational-only) → v2-recommend (2026-06-06): the
# dashboard dropped its educational-only guardrail. The Watch line may
# now carry a direct, actionable takeaway; only an anti-hype post-check
# survives. Bumping the version invalidates stale cache rows.
_PROMPT_VERSION = "v2-recommend"

# The only post-check ban now: pump/hype. Directional / actionable
# language is allowed — that is the whole point of the rework.
_BANS = FORBIDDEN_HYPE

# Quiet fallback when both Claude attempts hit a hype word. Trio-shaped
# so the frontend renders uniformly.
_QUIET: dict[Locale, tuple[str, str, str]] = {
    "en": (
        "The income ledger looks steady; nothing stands out in the trailing distributions right now.",
        "The book is collecting its usual income with no unusual shift in the mix.",
        "Keep an eye on the next scheduled ex-dates and whether any single name's share of income grows.",
    ),
    "zh": (
        "收入账面平稳，过去十二个月的派息没有特别突出之处。",
        "组合照常收取分红，收入构成没有异常变化。",
        "留意下一批除息日，以及单一持仓的收入占比是否上升。",
    ),
}

_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文回答。所有结构化标签（'What:' / 'Meaning:' / 'Watch:'）保持英文以便解析。"
        "采用零售投资者的朴素中文，避免术语。\n"
    ),
}

_PROMPT = """\
You are writing three short lines about the INCOME LEDGER of a personal
investment portfolio for a beginner investor's dashboard. The reader is a
first-year student. They already see the per-holding TTM distributions,
next ex-dates, and the stacked-bar showing each name's share of trailing
income; this is the deeper plain-English context.

You may give a direct, actionable view. Keep it calm and grounded: no
hype, no guarantees, no certainty claims. The reader makes the final
decision.

Output format, exact and machine-parsed, three lines:

What: <one sentence: describe what the income ledger looks like right now.
       Name the holding that contributes the most trailing income and
       mention if it is a REIT.>
Meaning: <one sentence: what the income shape means in plain terms.
          Pattern or context. Avoid jargon.>
Watch: <one sentence: what this suggests you might do or keep an eye on as
        you decide; a concrete, actionable takeaway is welcome.>

Hard rules:
- EXACTLY three lines, with the literal labels "What:" / "Meaning:" /
  "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15.
- Dollar amounts quoted verbatim if used.
- NEVER use em dashes (—) in any output line. Use colons, commas, or
  periods instead.

Describe the ledger and its shape in plain everyday words like "the book
received …", "most trailing income came from …", "the next scheduled
distribution is …".

Tone: matter-of-fact, calm, considered. Like a patient teacher writing
one note in a personal ledger.

Output the three lines only. No preamble, no markdown, no bullets.
"""


@dataclass(frozen=True)
class DividendsInsight:
    cache_key: str
    what: str
    meaning: str
    watch: str
    generated_at: datetime
    cached: bool = False


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS dividends_insight_cache (
                cache_key VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                what VARCHAR,
                meaning VARCHAR,
                watch VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (cache_key, prompt_version)
            )
            """
        )


def _make_key(r: dividends.DividendsResponse) -> str:
    """Hash the income shape. Identical books hit cache. Sensitive to
    TTM total + top-3 contributing names + count of names with history.
    """
    items_with_history = [i for i in r.items if i.ttm_total_usd > 0]
    items_with_history.sort(key=lambda i: -i.ttm_total_usd)
    top3 = [i.code for i in items_with_history[:3]]
    payload = "|".join(
        [
            f"ttm={round(r.totals_ttm_total_usd, 2)}",
            f"top3={','.join(top3)}",
            f"with_hist={len(items_with_history)}",
            f"next30={round(r.totals_next_30d_total_usd, 2)}",
        ]
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def _load_cached(
    cache_key: str, locale: Locale = DEFAULT_LOCALE
) -> tuple[str, str, str, datetime] | None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT what, meaning, watch, generated_at FROM dividends_insight_cache "
            "WHERE cache_key = ? AND prompt_version = ?",
            [cache_key, pv],
        ).fetchone()
    if not row:
        return None
    what, meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return what, meaning, watch, generated_at


def _save_cache(
    cache_key: str,
    what: str,
    meaning: str,
    watch: str,
    generated_at: datetime,
    locale: Locale = DEFAULT_LOCALE,
) -> None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO dividends_insight_cache VALUES (?, ?, ?, ?, ?, ?)",
            [cache_key, pv, what, meaning, watch, generated_at],
        )


def _build_user_message(r: dividends.DividendsResponse) -> str:
    parts = [
        f"Trailing 12 months total: ${r.totals_ttm_total_usd:.2f} USD",
        f"Next 30 days scheduled: ${r.totals_next_30d_total_usd:.2f} USD",
        f"Next 90 days scheduled: ${r.totals_next_90d_total_usd:.2f} USD",
    ]
    items = sorted(r.items, key=lambda i: -i.ttm_total_usd)
    parts.append("Per holding (TTM USD, currency, REIT flag, next ex-date):")
    for i in items:
        line = (
            f"  - {i.ticker} ({i.code}): ${i.ttm_total_usd:.2f} TTM, "
            f"native {i.currency}, REIT={i.is_reit}"
        )
        if i.next_ex_date:
            est = (
                f", next est ${i.next_amount_total_usd:.2f}"
                if i.next_amount_total_usd
                else ""
            )
            line += f", next ex {i.next_ex_date}{est}"
        else:
            line += ", no scheduled ex-date"
        if i.ttm_total_usd == 0 and not i.next_ex_date:
            line += " (no distributions on record)"
        parts.append(line)
    return "\n".join(parts)


def _parse_body(body: str) -> tuple[str, str, str]:
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
    return what, meaning, watch


def _call_claude(
    user_message: str, locale: Locale = DEFAULT_LOCALE
) -> tuple[str, str, str]:
    """Returns (what, meaning, watch).

    Runs the anti-hype post-check + one retry. If both attempts hit a hype
    word, falls back to the locale-specific quiet trio.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/dividends-insight."
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")
    bans = _BANS[locale]
    system_prompt = _PROMPT + _LANG_INSTRUCTION[locale]

    def _shot(system: str) -> str:
        response = client.messages.create(
            model=model,
            max_tokens=400,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        return "\n".join(b.text for b in response.content if b.type == "text").strip()

    body = _shot(system_prompt)
    bad = has_forbidden(body, bans, locale)
    if bad is not None:
        log.info("dividends-insight: hype %r in first draft, retrying (locale=%s)", bad, locale)
        retry_suffix = (
            RETRY_SUFFIX_HYPE_ZH if locale == "zh" else RETRY_SUFFIX_HYPE_EN
        ).format(bad=bad)
        body = _shot(system_prompt + retry_suffix)
        bad2 = has_forbidden(body, bans, locale)
        if bad2 is not None:
            log.warning(
                "dividends-insight: hype %r persisted after retry, quieting (locale=%s)",
                bad2, locale,
            )
            return _QUIET[locale]

    what, meaning, watch = _parse_body(body)
    if not (what or meaning or watch):
        what = body
    return what, meaning, watch


def get_insight(
    force_refresh: bool = False, locale: Locale = DEFAULT_LOCALE
) -> DividendsInsight | None:
    r = dividends.get_portfolio()
    if not r.items:
        return None
    # If nothing has trailing income AND nothing has a scheduled
    # ex-date in the next 90 days, there's nothing to interpret — let
    # the route 404 so the UI hides the trio.
    if (
        r.totals_ttm_total_usd <= 0
        and r.totals_next_90d_total_usd <= 0
    ):
        return None

    cache_key = _make_key(r)
    if not force_refresh:
        cached = _load_cached(cache_key, locale)
        if cached is not None:
            what, meaning, watch, gen_at = cached
            return DividendsInsight(
                cache_key=cache_key,
                what=what,
                meaning=meaning,
                watch=watch,
                generated_at=gen_at,
                cached=True,
            )

    user_message = _build_user_message(r)
    what, meaning, watch = _call_claude(user_message, locale)
    now = datetime.now()
    _save_cache(cache_key, what, meaning, watch, now, locale)
    return DividendsInsight(
        cache_key=cache_key,
        what=what,
        meaning=meaning,
        watch=watch,
        generated_at=now,
    )

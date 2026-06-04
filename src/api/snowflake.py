"""SWS-style snowflake scoring + statement-card aggregator.

Drives the gold pentagon visualisation on `/portfolio` Holdings tab,
the hero strip on `/`, and the inline drill-in 5-axis statement grid.

Two halves:
  • Deterministic 0-6 score per axis. Past + Health + Dividends are
    derived from data we already have (holdings P&L, 30-day price
    delta, anomaly net signal, dividend TTM + cadence). Valuation +
    Future stay `None` until peer-PE / analyst-forecast layers ship.
  • Claude JSON pass: 3-5 bullets per axis as
    `{icon: "check"|"warn"|"neutral", headline, sub}`. Statement cards
    are allowed to use judgement language ("trading 30% below fair
    value", "moderate debt") — only the trading-action subset is
    banned. That subset is `FORBIDDEN_TRADING_ACTIONS` in
    `analysts/_base`, distinct from the prose advisors' full ban.

Cache: `snowflake_cache (code, prompt_version, scores_json,
statements_json, generated_at)`, locale-keyed prompt_version so EN +
ZH statement language coexist. 6h TTL. Single-writer rule preserved
via `prices._db()` + `_DB_LOCK`.

JSON parse: prefix-tolerant — strip leading non-`{` chars before
`json.loads`. On parse failure, statements drop to empty per axis;
the deterministic scores still ship.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta

from api._advisor_guard import RETRY_SUFFIX_EN, RETRY_SUFFIX_ZH, has_forbidden
from api.data import anomalies, prices
from api.data.moomoo_client import get_summary
from api.dividends import get_one as get_dividend_for
from api.holdings_payload import build_holdings_response
from api.i18n import DEFAULT_LOCALE, Locale, prompt_version_with_locale

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
_PROMPT_VERSION = "v3-snowflake-valuation"

# Per-axis cap so the UI's vertical real estate stays bounded.
_MAX_BULLETS = 5


# Post-check bans for statement bullets. Narrower than
# FORBIDDEN_TRADING_ACTIONS — ambiguous tokens with legitimate
# descriptive uses (buy/sell/hold/add/trim/target) live in the prompt
# prose only, since context lines feed Claude moomoo anomaly text like
# "big institutions have been buying / selling". The post-check focuses
# on unambiguous characterisation: recommendation verbs, hype words,
# and forward-looking modals. Same convention insight.py / digest.py
# use against their full prompt ban lists.
_STATEMENT_BANS_EN: tuple[str, ...] = (
    "forecast", "predict", "recommend", "should", "ought",
    "bullish", "bearish", "surge", "plunge", "soar", "crash",
    "breakout", "rally", "tank",
)
_STATEMENT_BANS_ZH: tuple[str, ...] = (
    "目标价", "预测", "推荐", "建议", "应该", "理应",
    "看多", "看涨", "看空", "看跌",
    "飙升", "暴涨", "暴跌", "大跌", "崩盘", "突破点", "反弹",
)


# ── Score buckets ────────────────────────────────────────────────────────────


# past: combine total-return + 30-day delta into a single 0..6 bucket.
# Thresholds chosen so a stable holding sits at 3 (neutral), strong
# multi-year winners reach 5-6, drawdowns slide to 0-2.
_PAST_THRESHOLDS = (-0.25, -0.10, 0.0, 0.10, 0.25, 0.50)


def _bucket_past(avg_pct: float) -> int:
    for i, threshold in enumerate(_PAST_THRESHOLDS):
        if avg_pct < threshold:
            return i
    return 6


# future: bucket the analyst-forecast next-year EPS growth into 0..6.
#
# Six ascending cut points; the score is the count of thresholds the
# value clears (below the first → 0, above all six → 6), same shape as
# `_PAST_THRESHOLDS`. Growth is a fraction (0.20 = +20%). Calibrated
# 2026-06-04 against the live book (MU +80%, INTC +42%, ANET +23%,
# K71U +5%, NBIS -45%) with the US index forecast ~+16.5%, so the bands
# spread the real holdings across the range:
#     < -10%  → 0   (a genuine forecast decline, e.g. NBIS)
#     -10..5% → 1
#     5..12%  → 2   (flat-to-modest, e.g. K71U)
#     12..18% → 3   (around the market rate)
#     18..28% → 4   (e.g. ANET)
#     28..45% → 5   (e.g. INTC)
#     ≥ 45%   → 6   (a standout grower, e.g. MU)
# Observational bands, not a verdict — retune freely.
_FUTURE_THRESHOLDS: tuple[float, ...] | None = (-0.10, 0.05, 0.12, 0.18, 0.28, 0.45)


def _bucket_future(fwd_eps_growth: float | None) -> int | None:
    """0..6 score from forecast next-year EPS growth, or None when no
    forecast exists or the thresholds are unset. Mirrors _bucket_past."""
    if fwd_eps_growth is None or _FUTURE_THRESHOLDS is None:
        return None
    for i, threshold in enumerate(_FUTURE_THRESHOLDS):
        if fwd_eps_growth < threshold:
            return i
    return 6


def _safe_fwd_eps(code: str) -> float | None:
    """Forecast next-year EPS growth for `code`, defensively — a
    fundamentals/yfinance hiccup must never break the snowflake. Cached
    24h in fundamentals_cache so this is a no-op after the first warm."""
    try:
        from api import fundamentals
        return fundamentals.get_fundamentals(code).fwd_eps_growth
    except Exception as exc:  # noqa: BLE001
        log.debug("snowflake: fwd_eps fetch failed for %s: %s", code, exc)
        return None


# valuation: score forward PE relative to the ~18x US market PE — cheaper
# than the market reads as better value (SWS "Value" posture). Ascending
# PE-ratio (forward_pe / market_pe) cut points; UNLIKE the other axes a
# higher ratio scores LOWER, so the score counts DOWN from 6 as the ratio
# clears each band. ~market (ratio 1.0) lands at 3, < 0.6× → 6 (cheap),
# ≥ 2× → 0 (expensive). Null for HK/SG + ETFs lacking a forward PE.
_VALUATION_PE_RATIO_BANDS = (0.6, 0.85, 1.0, 1.3, 1.7, 2.0)


def _bucket_valuation(forward_pe: float | None, market_pe: float | None) -> int | None:
    if forward_pe is None or forward_pe <= 0 or market_pe is None or market_pe <= 0:
        return None
    ratio = forward_pe / market_pe
    score = 6
    for threshold in _VALUATION_PE_RATIO_BANDS:
        if ratio >= threshold:
            score -= 1
    return max(0, score)


def _safe_valuation_score(code: str) -> int | None:
    """0..6 forward-PE-vs-market score for `code`, defensively. fair_value
    caches both the per-holding PE and the SPY market PE (24h), so this is
    a no-op after warm."""
    try:
        from api import fair_value
        metrics = fair_value.get_metrics(code)
        return _bucket_valuation(metrics.forward_pe, fair_value._market_pe_fallback())
    except Exception as exc:  # noqa: BLE001
        log.debug("snowflake: valuation score failed for %s: %s", code, exc)
        return None


# health: count net positive vs negative anomaly signals. moomoo's
# capital-flow prose mentions inflow/outflow + accumulation/distribution
# in the body; we keyword-spot to avoid coupling to translator output.
_POS_HEALTH = ("inflow", "accumulat", "buying", "净流入", "吸筹", "买入")
_NEG_HEALTH = ("outflow", "distribut", "selling", "净流出", "派发", "卖出")


def _bucket_health(code: str) -> int:
    pos = neg = 0
    for anom in anomalies.fetch_all_plain(code):
        if not anom.has_content:
            continue
        body = anom.content.lower()
        pos += sum(1 for kw in _POS_HEALTH if kw in body)
        neg += sum(1 for kw in _NEG_HEALTH if kw in body)
    if pos == 0 and neg == 0:
        return 3
    net = pos - neg
    return max(0, min(6, 3 + net))


# dividends: yield + consistency. Non-payer → 0. Otherwise the TTM yield
# bucket scaled 1..5 (steeper than past — most stocks land low here),
# +1 if the trailing 8-payment window has zero zero-amount entries.
_YIELD_BUCKETS_PCT = (0.5, 1.5, 2.5, 4.0, 6.0)


def _bucket_dividends(code: str, current_price: float, currency: str) -> int:
    holding = get_dividend_for(code)
    if holding is None or holding.ttm_per_share_native <= 0 or current_price <= 0:
        return 0
    yield_pct = (holding.ttm_per_share_native / current_price) * 100.0
    score = 1
    for i, threshold in enumerate(_YIELD_BUCKETS_PCT, start=2):
        if yield_pct >= threshold:
            score = i
    if holding.history_count >= 4 and all(
        p.amount_per_share_native > 0 for p in holding.history
    ):
        score = min(6, score + 1)
    return score


# ── Dataclasses ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SnowflakeScores:
    past: int | None
    health: int | None
    dividends: int | None
    valuation: int | None
    future: int | None


@dataclass(frozen=True)
class Statement:
    icon: str   # "check" | "warn" | "neutral"
    headline: str
    sub: str | None


@dataclass(frozen=True)
class Snowflake:
    code: str
    ticker: str
    scores: SnowflakeScores
    statements: dict[str, list[Statement]]   # "past" | "health" | "dividend"
    generated_at: datetime
    cached: bool = False


@dataclass(frozen=True)
class PortfolioSnowflake:
    scores: SnowflakeScores
    generated_at: datetime
    cached: bool = False
    weights: dict[str, float] = field(default_factory=dict)


# ── Cache ────────────────────────────────────────────────────────────────────


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS snowflake_cache (
                code VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                scores_json VARCHAR,
                statements_json VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (code, prompt_version)
            )
            """
        )


def _load_cached(code: str, locale: Locale) -> Snowflake | None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT scores_json, statements_json, generated_at "
            "FROM snowflake_cache WHERE code = ? AND prompt_version = ?",
            [code, pv],
        ).fetchone()
    if not row:
        return None
    scores_json, statements_json, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    try:
        scores = SnowflakeScores(**json.loads(scores_json))
        statements = {
            axis: [Statement(**s) for s in bullets]
            for axis, bullets in json.loads(statements_json).items()
        }
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        log.warning("snowflake cache decode failed for %s: %s", code, exc)
        return None
    return Snowflake(
        code=code,
        ticker=code.split(".", 1)[-1],
        scores=scores,
        statements=statements,
        generated_at=generated_at,
        cached=True,
    )


def _save_cache(snow: Snowflake, locale: Locale) -> None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    statements_json = json.dumps(
        {axis: [asdict(s) for s in bullets] for axis, bullets in snow.statements.items()}
    )
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO snowflake_cache VALUES (?, ?, ?, ?, ?)",
            [snow.code, pv, json.dumps(asdict(snow.scores)), statements_json, snow.generated_at],
        )


# ── Score computation ───────────────────────────────────────────────────────


def _compute_scores(code: str, total_pnl_pct: float, current_price: float, currency: str) -> SnowflakeScores:
    closes = prices.get_close_series(code, days=30)
    delta_30d = (
        (closes[-1] - closes[0]) / closes[0]
        if len(closes) >= 2 and closes[0]
        else 0.0
    )
    past = _bucket_past((total_pnl_pct + delta_30d) / 2.0)
    health = _bucket_health(code)
    dividends_score = _bucket_dividends(code, current_price, currency)
    # Skip the fundamentals fetch entirely until thresholds are set, so an
    # unconfigured Future axis costs nothing on the hot snowflake path.
    future = _bucket_future(_safe_fwd_eps(code)) if _FUTURE_THRESHOLDS is not None else None
    valuation = _safe_valuation_score(code)
    return SnowflakeScores(
        past=past,
        health=health,
        dividends=dividends_score,
        valuation=valuation,
        future=future,
    )


# ── Claude JSON statements ──────────────────────────────────────────────────


_STATEMENTS_PROMPT = """\
You are writing 3-5 short statement-card bullets per axis for ONE stock
holding in a beginner investor's dashboard. The reader is a first-year
student. Each bullet teaches one observation about that axis.

Output ONLY a JSON object — no preamble, no markdown fences, no
explanation. The object must have exactly three keys: "past", "health",
"dividend". Each value is an array of bullet objects.

Each bullet object has three fields:
  - "icon": one of "check" | "warn" | "neutral"
    · check  = the observation reads favourably ("earnings grew 12%")
    · warn   = the observation reads unfavourably ("debt rose")
    · neutral = neither favourable nor unfavourable
  - "headline": ≤18 words. Concrete past-tense observation. Quote
    percentages and currency figures verbatim.
  - "sub": ≤30 words, OR null. Optional context line.

Hard limits:
  - Maximum 5 bullets per axis. Aim for 3 if signals are thin.
  - Empty array is acceptable when no data supports that axis.
  - The "dividend" axis key (not "dividends") is intentional — match it.

Framing rules (relaxed vs. prose advisors — judgement words allowed):
  - Allowed: "good value", "moderate debt", "strong cash position",
    "earnings grew 153.7% over past year", "trading 30% below fair
    value", "consistent dividend history".
  - NEVER use trading-action language: buy / sell / hold / trim / add /
    target / forecast / predict / expect / recommend / "should" /
    "ought" / bullish / bearish / surge / plunge / soar / crash /
    breakout / rally / tank.
  - Past tense for "past" + "health" axes. Dividend bullets may use
    present-tense statements about current yield ("pays a 3.4% yield").

Stay observational. The icon classifies the observation, not a verdict.
"""

_STATEMENTS_PROMPT_ZH_SUFFIX = (
    "\n\n请使用简体中文撰写所有 headline 与 sub 文案。JSON 的字段名"
    "(\"past\"/\"health\"/\"dividend\"/\"icon\"/\"headline\"/\"sub\") 保持英文。"
    "禁用以下中文行动词汇：买入、卖出、持有、加仓、减仓、清仓、目标价、"
    "预测、推荐、建议、应该、理应、看多、看涨、看空、看跌、"
    "飙升、暴涨、暴跌、大跌、崩盘、突破点、反弹。允许使用判断性语言"
    "（如 \"良好\"、\"稳健\"、\"债务温和\"），但必须基于已发生的事实。"
)


_EMPTY_STATEMENTS: dict[str, list[Statement]] = {"past": [], "health": [], "dividend": []}


def _build_signal_context(
    code: str,
    ticker: str,
    name: str,
    total_pnl_pct: float,
    current_price: float,
    currency: str,
    scores: SnowflakeScores,
) -> str:
    closes = prices.get_close_series(code, days=90)
    delta_90d = (
        (closes[-1] - closes[0]) / closes[0] * 100.0
        if len(closes) >= 2 and closes[0]
        else None
    )
    anomaly_lines = [
        f"  - {a.label}: {a.content.strip()}"
        for a in anomalies.fetch_all_plain(code)
        if a.has_content
    ]
    div = get_dividend_for(code)
    lines = [
        f"Stock: {ticker} ({code}, {name})",
        f"  Price: {currency} {current_price:.2f}",
        f"  Total P&L: {total_pnl_pct * 100:+.2f}%",
        f"  90-day return: {delta_90d:+.2f}%" if delta_90d is not None else "  90-day return: n/a",
        f"  Scores (0-6): past={scores.past}, health={scores.health}, dividend={scores.dividends}",
    ]
    if anomaly_lines:
        lines.append("  Anomaly signals:")
        lines.extend(anomaly_lines)
    if div and div.ttm_per_share_native > 0:
        yield_pct = (div.ttm_per_share_native / current_price) * 100.0 if current_price > 0 else 0
        lines.append(
            f"  Dividend: TTM {currency} {div.ttm_per_share_native:.4f}/share "
            f"({yield_pct:.2f}% yield), {div.history_count} payments on record"
            f"{', REIT' if div.is_reit else ''}"
        )
    return "\n".join(lines)


def _parse_statements(body: str) -> dict[str, list[Statement]]:
    body = body.strip()
    # Strip ```json fences if model added them.
    if body.startswith("```"):
        body = body.strip("`")
        if body.startswith("json"):
            body = body[4:]
    # Skip non-JSON prefix.
    brace = body.find("{")
    if brace == -1:
        return dict(_EMPTY_STATEMENTS)
    try:
        raw = json.loads(body[brace:])
    except json.JSONDecodeError as exc:
        log.warning("snowflake JSON parse failed: %s", exc)
        return dict(_EMPTY_STATEMENTS)

    out: dict[str, list[Statement]] = {"past": [], "health": [], "dividend": []}
    for axis in out:
        items = raw.get(axis, [])
        if not isinstance(items, list):
            continue
        for item in items[:_MAX_BULLETS]:
            if not isinstance(item, dict):
                continue
            icon = item.get("icon")
            headline = item.get("headline")
            if icon not in {"check", "warn", "neutral"} or not headline:
                continue
            sub = item.get("sub")
            if sub is not None and not isinstance(sub, str):
                sub = None
            out[axis].append(Statement(icon=icon, headline=str(headline), sub=sub))
    return out


def _call_claude_statements(
    context: str,
    locale: Locale,
) -> dict[str, list[Statement]]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return dict(_EMPTY_STATEMENTS)

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")
    bans = _STATEMENT_BANS_ZH if locale == "zh" else _STATEMENT_BANS_EN
    system_prompt = _STATEMENTS_PROMPT + (_STATEMENTS_PROMPT_ZH_SUFFIX if locale == "zh" else "")

    def _shot(system: str) -> str:
        response = client.messages.create(
            model=model,
            max_tokens=1200,
            system=system,
            messages=[{"role": "user", "content": context}],
        )
        return "\n".join(b.text for b in response.content if b.type == "text").strip()

    try:
        body = _shot(system_prompt)
    except Exception as exc:
        log.warning("snowflake Claude call failed: %s", exc)
        return dict(_EMPTY_STATEMENTS)

    bad = has_forbidden(body, bans, locale)
    if bad is not None:
        log.info("snowflake: forbidden %r in first draft, retrying (locale=%s)", bad, locale)
        retry_suffix = (RETRY_SUFFIX_ZH if locale == "zh" else RETRY_SUFFIX_EN).format(bad=bad)
        try:
            body = _shot(system_prompt + retry_suffix)
        except Exception as exc:
            log.warning("snowflake retry failed: %s", exc)
            return dict(_EMPTY_STATEMENTS)
        bad2 = has_forbidden(body, bans, locale)
        if bad2 is not None:
            log.warning("snowflake: forbidden %r persisted, dropping statements", bad2)
            return dict(_EMPTY_STATEMENTS)

    return _parse_statements(body)


# ── Public API ──────────────────────────────────────────────────────────────


def get_for_code(
    code: str,
    force_refresh: bool = False,
    locale: Locale = DEFAULT_LOCALE,
) -> Snowflake | None:
    """Snowflake for a single holding. Returns None if not in the book.
    Watchlist codes route through `get_for_watch` so non-held names get
    a snowflake without forcing a moomoo position entry.
    """
    if not force_refresh:
        cached = _load_cached(code, locale)
        if cached is not None:
            return cached

    summary = get_summary()
    pos = next((p for p in summary.positions if p.code == code), None)
    if pos is None:
        return None

    scores = _compute_scores(code, pos.total_pnl_pct, pos.current_price, pos.currency)
    context = _build_signal_context(
        code, pos.ticker, pos.name, pos.total_pnl_pct, pos.current_price, pos.currency, scores
    )
    statements = _call_claude_statements(context, locale)
    snow = Snowflake(
        code=code,
        ticker=pos.ticker,
        scores=scores,
        statements=statements,
        generated_at=datetime.now(),
    )
    _save_cache(snow, locale)
    return snow


def get_for_watch(
    code: str,
    current_price: float,
    currency: str,
    force_refresh: bool = False,
    locale: Locale = DEFAULT_LOCALE,
) -> Snowflake:
    """Snowflake for a non-held watchlist code. Past + dividend axes
    still work off price + dividend cache; total_pnl_pct is treated as
    zero so the `past` score reflects only 30-day delta.
    """
    if not force_refresh:
        cached = _load_cached(code, locale)
        if cached is not None:
            return cached

    scores = _compute_scores(code, 0.0, current_price, currency)
    ticker = code.split(".", 1)[-1]
    context = _build_signal_context(code, ticker, ticker, 0.0, current_price, currency, scores)
    statements = _call_claude_statements(context, locale)
    snow = Snowflake(
        code=code,
        ticker=ticker,
        scores=scores,
        statements=statements,
        generated_at=datetime.now(),
    )
    _save_cache(snow, locale)
    return snow


def get_for_portfolio(locale: Locale = DEFAULT_LOCALE) -> PortfolioSnowflake:
    """USD-weighted aggregate over current holdings. Statements omitted
    — the portfolio view shows the polygon + score chips only.
    """
    summary = get_summary()
    if not summary.positions:
        return PortfolioSnowflake(
            scores=SnowflakeScores(past=None, health=None, dividends=None, valuation=None, future=None),
            generated_at=datetime.now(),
        )

    response = build_holdings_response(summary)
    total = response.total_market_value_usd or 1.0
    weights: dict[str, float] = {}
    weighted = {"past": 0.0, "health": 0.0, "dividends": 0.0, "future": 0.0, "valuation": 0.0}
    counts = {"past": 0.0, "health": 0.0, "dividends": 0.0, "future": 0.0, "valuation": 0.0}

    for holding in response.holdings:
        weight = (holding.market_value_usd or 0.0) / total
        weights[holding.code] = weight
        snow = get_for_code(holding.code, locale=locale)
        if snow is None:
            continue
        for axis, value in (
            ("past", snow.scores.past),
            ("health", snow.scores.health),
            ("dividends", snow.scores.dividends),
            ("future", snow.scores.future),
            ("valuation", snow.scores.valuation),
        ):
            if value is not None:
                weighted[axis] += value * weight
                counts[axis] += weight

    def _round(axis: str) -> int | None:
        if counts[axis] <= 0:
            return None
        return round(weighted[axis] / counts[axis])

    return PortfolioSnowflake(
        scores=SnowflakeScores(
            past=_round("past"),
            health=_round("health"),
            dividends=_round("dividends"),
            valuation=_round("valuation"),
            future=_round("future"),
        ),
        generated_at=datetime.now(),
        weights=weights,
    )


def snowflake_to_dict(snow: Snowflake) -> dict:
    return {
        "code": snow.code,
        "ticker": snow.ticker,
        "scores": asdict(snow.scores),
        "statements": {
            axis: [asdict(s) for s in bullets]
            for axis, bullets in snow.statements.items()
        },
        "generated_at": snow.generated_at.isoformat(),
        "cached": snow.cached,
    }


def portfolio_snowflake_to_dict(snow: PortfolioSnowflake) -> dict:
    return {
        "scores": asdict(snow.scores),
        "weights": snow.weights,
        "generated_at": snow.generated_at.isoformat(),
        "cached": snow.cached,
    }

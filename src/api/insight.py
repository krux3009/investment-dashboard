"""Per-stock educational insight (Meaning + Watch).

Lives under each holding's drill-in. Short summaries stay in the daily
digest at the top of the page; deeper teaching about ONE ticker happens
here when the user expands a row.

For a given code we collect the same signals the digest sees (anomalies,
30-day delta, today's move, news headlines for that one symbol) and ask
Claude for two short labelled lines:

    Meaning: <educational interpretation — why today's number matters,
              how it compares to typical, what pattern it fits>
    Watch:   <observation target — what to monitor over coming sessions>

Cached in `prices.duckdb` table `insight_cache`, keyed by
(code, prompt_version). 6h TTL — same cadence as the digest. Bump
_PROMPT_VERSION to invalidate without dropping the table.

If ANTHROPIC_API_KEY is missing the route returns 503; we never silently
fall back to "Meaning unavailable" prose because that would be confusing
inline with the anomaly drill-in.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from api.data import anomalies, prices
from api.data.moomoo_client import get_summary
from api.digest import _fetch_news
from api.i18n import DEFAULT_LOCALE, Locale, prompt_version_with_locale

log = logging.getLogger(__name__)

_TTL = timedelta(hours=6)
# v3-no-em-dash → v4-no-em-dash (2026-05-10): locale-aware prompts.
# Cache key is now `f"{_PROMPT_VERSION}-{locale}"` so en + zh prose
# coexist without collisions.
# v4-no-em-dash → v5-source-edit (2026-05-13): ported the digest v6
# source-edit pairs into _INSIGHT_PROMPT (en) + _LANG_INSTRUCTION["zh"]:
# (1) describe price movement, not the pace of a trend (accelerating /
# decelerating / slowing / easing); (2) Meaning line is past-only, no
# forward-look expectations — the Watch line names an observation target
# without predicting its outcome. FORBIDDEN list unchanged; fix is at
# the prompt level. Old v4 rows in insight_cache become orphaned and
# rebuild on next request.
_PROMPT_VERSION = "v5-source-edit"

_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文回答。所有结构化标签（'Meaning:' / 'Watch:'）保持英文以便解析。"
        "采用零售投资者的朴素中文，避免术语。禁用以下中文词汇："
        "买入、卖出、持有、加仓、减仓、清仓、目标价、预测、预计、推荐、建议、"
        "应该、理应、看多、看涨、看空、看跌、飙升、暴涨、暴跌、大跌、崩盘、"
        "突破、突破点、反弹、显著、强劲、疲软、稳健、动能、势头。"
        "\n\n不要描述任何指标的节奏——无论是趋势、资金流、买盘还是卖盘。"
        "写发生了什么，不要说它在加速、减速、放缓或趋缓。\"节奏\" 一词本身禁用。"
        "\n    反例：\"下跌节奏放缓\" / \"上行速度趋缓\" / \"机构卖出节奏改变\""
        "\n    正例：\"过去 30 天下跌 3.79%，近五个交易日中有三个收低\" / "
        "\"机构卖出：May 13 当日成交量比前三日小 65%\""
        "\n\n\"Meaning:\" 一行只写已发生的事实，不得包含前瞻性预期。"
        "\"Watch:\" 一行写一个观察对象，不得预测其结果。"
        "\n    反例 (Meaning)：\"价格上行，可能面临阻力\""
        "\n    正例 (Meaning)：\"30 天涨幅为 +100%，当前价格接近 30 天高点\""
        "\n    反例 (Watch)：\"价格下周可能继续上涨\""
        "\n    正例 (Watch)：\"观察下次财报现金流是否延续当前趋势\""
        "\n\nWatch 一行的时间词优先使用 \"下次/下个/未来\"，避免 \"后续\"。"
        "\n    反例 (Watch)：\"观察后续季度营收是否出现变化\""
        "\n    正例 (Watch)：\"观察未来季度营收是否出现变化\""
        "\n\n日期保留原英文（如 \"May 8\"）即可，无需翻译。\n"
    ),
}

_INSIGHT_PROMPT = """\
You are writing two short educational lines for ONE stock holding in a
beginner investor's dashboard. The reader is a first-year student who
has never invested. They have already read a one-line summary at the top
of the page; this is the deeper explanation for THIS specific stock.

Output format, exact and machine-parsed, two lines:

Meaning: <one educational sentence: what today's number or move means in context. Why it's notable, how it compares to typical, what pattern it fits, or what news connects to it.>
Watch: <one sentence: what to monitor in the next few sessions. Frame as observation targets, not actions.>

Hard rules:
- EXACTLY two lines, with the literal labels "Meaning:" and "Watch:".
- Each line ONE sentence, ≤22 words. Aim for 15. Brevity is valued.
- Do not repeat the today's-move number; the summary already has it.
  Use it as context for the educational point.
- Quote tickers, percentages, and currency figures verbatim if you use
  them. Numbers stay; words around them must be plain.
- Do not characterize the pace of any metric — trend, flows, selling,
  buying. Describe what happened, not whether it is accelerating,
  decelerating, slowing, or easing. The word "pace" itself is banned.
    Bad: "pace of decline slowing" / "rate-of-change easing" /
         "shifts the pace of institutional selling"
    Good: "down 3.79% over 30 days, three of the last five sessions lower" /
          "institutional selling: 65% smaller volume on May 13 than the prior three days"
- The "Meaning" line is past-only. Stick to what has happened. Do not
  state forward-looking expectations in Meaning. The "Watch" line names
  an observation target without predicting its outcome.
    Bad (Meaning): "price rising at a pace that may face friction ahead"
    Good (Meaning): "30-day change is +100%, current price near the 30-day high"
    Bad (Watch):   "the price will likely climb further next week"
    Good (Watch):  "Whether the next earnings update confirms the cash-flow trend"
- NEVER use em dashes (—) in any output line. Use colons, commas, or
  periods instead.

NEVER use these action words:
  buy / sell / hold / trim / add / target / forecast / predict / expect /
  recommend / "you should" / "you ought" / "consider [verb]" / "tomorrow".

NEVER use these hype words:
  surge / plunge / soar / crash / breakout / rally / tank.

Translate CONCEPTS, not just words. Never use these terms; use the
plain meaning on the right:

  Indicator overbought (RSI / KDJ / BIAS / MACD / CCI)
    → "the price has climbed fast and could slow soon"
  Indicator oversold
    → "the price has fallen fast and could steady soon"
  Moving averages / MA5 / MA10 / MA20 / Bollinger Band / trend lines
    → "the recent price trend"
  Death cross / golden cross
    → "the recent trend has shifted slightly down / up"
  Block-trade net inflows / outflows
    → "big institutions have been buying / selling"
  Short interest / short ratio
    → "bets that the price will fall"
  Perpetual securities / perpetual bonds
    → "raised long-term funding"

The "Meaning" line is the heart of this output. Make it teach. Prefer:
- Comparisons to typical ("a 43% one-month gain is unusually large for
  a public stock; most don't move that fast in a month")
- Pattern recognition ("flat days after big runs are normal: the
  price is digesting the move, not weakening")
- Connecting threads between news + price + flows

The "Watch" line names a future observation target. Phrase as what
would matter, not what to do.

If there is genuinely nothing material to teach about this stock today
(no anomaly, flat price, no news, no notable 30-day context), output
exactly:
  Meaning: Nothing notable for this holding today.
  Watch: Watch for the next earnings update or material news.

Tone: matter-of-fact, calm, considered. Like a patient teacher writing
one note in a personal ledger.

Output the two lines only. No preamble, no markdown, no bullet
characters.
"""


@dataclass(frozen=True)
class Insight:
    code: str
    ticker: str
    meaning: str
    watch: str
    generated_at: datetime
    cached: bool = False


# ── Cache ────────────────────────────────────────────────────────────────────


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS insight_cache (
                code VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                meaning VARCHAR,
                watch VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (code, prompt_version)
            )
            """
        )


def _load_cached(code: str, locale: Locale = DEFAULT_LOCALE) -> Insight | None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT meaning, watch, generated_at FROM insight_cache "
            "WHERE code = ? AND prompt_version = ?",
            [code, pv],
        ).fetchone()
    if not row:
        return None
    meaning, watch, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return Insight(
        code=code,
        ticker=code.split(".", 1)[-1],
        meaning=meaning,
        watch=watch,
        generated_at=generated_at,
        cached=True,
    )


def _save_cache(insight: Insight, locale: Locale = DEFAULT_LOCALE) -> None:
    _ensure_table()
    pv = prompt_version_with_locale(_PROMPT_VERSION, locale)
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO insight_cache VALUES (?, ?, ?, ?, ?)",
            [
                insight.code,
                pv,
                insight.meaning,
                insight.watch,
                insight.generated_at,
            ],
        )


# ── Signal collection (per-ticker, mirrors digest._collect_signals) ─────────


def _collect_one(code: str) -> dict | None:
    """Find the matching position in the live book and gather signals.
    Returns None if the code isn't held — drill-in is only opened on
    rows that exist, so this should be rare.
    """
    summary = get_summary()
    pos = next((p for p in summary.positions if p.code == code), None)
    if pos is None:
        return None

    anomaly_lines = [
        f"  - {a.label}: {a.content.strip()}"
        for a in anomalies.fetch_all_plain(pos.code)
        if a.has_content
    ]

    closes = prices.get_close_series(pos.code, days=30)
    delta_30d_pct = (
        (closes[-1] - closes[0]) / closes[0]
        if len(closes) >= 2 and closes[0]
        else None
    )

    news = _fetch_news(pos.code)
    news_lines = [
        f"  - \"{n['title']}\" ({n['publisher']})" for n in news
    ]

    return {
        "ticker": pos.ticker,
        "code": pos.code,
        "name": pos.name,
        "currency": pos.currency,
        "current_price": pos.current_price,
        "today_pct": pos.today_change_pct,
        "delta_30d_pct": delta_30d_pct,
        "anomaly_lines": anomaly_lines,
        "news_lines": news_lines,
    }


def _format_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    sign = "+" if value > 0 else ""
    return f"{sign}{value * 100:.2f}%"


def _build_user_message(s: dict) -> str:
    today = datetime.now().strftime("%A, %B %-d %Y")
    lines: list[str] = [
        f"Date: {today}",
        "",
        f"Stock: {s['ticker']} ({s['code']}, {s['name']})",
        (
            f"  Price: {s['currency']} {s['current_price']:.2f} · "
            f"today {_format_pct(s['today_pct'])} · "
            f"30-day {_format_pct(s['delta_30d_pct'])}"
        ),
    ]
    if s["anomaly_lines"]:
        lines.append("  Anomalies:")
        lines.extend(s["anomaly_lines"])
    else:
        lines.append("  Anomalies: none")
    if s["news_lines"]:
        lines.append("  Headlines:")
        lines.extend(s["news_lines"])
    else:
        lines.append("  Headlines: none")
    return "\n".join(lines)


# ── Claude call ─────────────────────────────────────────────────────────────


def _call_claude(user_message: str, locale: Locale = DEFAULT_LOCALE) -> tuple[str, str]:
    """Returns (meaning, watch). Parses the two-line output."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/insight."
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")

    system_prompt = _INSIGHT_PROMPT + _LANG_INSTRUCTION[locale]

    response = client.messages.create(
        model=model,
        max_tokens=400,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    body = "\n".join(b.text for b in response.content if b.type == "text").strip()

    meaning = ""
    watch = ""
    for line in body.splitlines():
        line = line.strip()
        if line.lower().startswith("meaning:"):
            meaning = line.split(":", 1)[1].strip()
        elif line.lower().startswith("watch:"):
            watch = line.split(":", 1)[1].strip()

    if not meaning and not watch:
        # Model drifted from the format — surface raw body as meaning.
        meaning = body
    return meaning, watch


# ── Public API ──────────────────────────────────────────────────────────────


def get_insight(
    code: str, force_refresh: bool = False, locale: Locale = DEFAULT_LOCALE
) -> Insight | None:
    """Return per-stock insight, hitting the 6h cache unless force_refresh.
    Returns None if `code` isn't a current holding.
    """
    if not force_refresh:
        cached = _load_cached(code, locale)
        if cached is not None:
            return cached

    signals = _collect_one(code)
    if signals is None:
        return None

    user_message = _build_user_message(signals)
    meaning, watch = _call_claude(user_message, locale)
    insight = Insight(
        code=code,
        ticker=signals["ticker"],
        meaning=meaning,
        watch=watch,
        generated_at=datetime.now(),
    )
    _save_cache(insight, locale)
    return insight

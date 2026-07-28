"""Per-stock recommendation (Action + Why + Confidence + Risk).

Lives under each holding's drill-in. Short summaries stay in the daily
digest at the top of the page; the per-ticker recommendation happens here
when the user expands a row.

For a given code we collect the signals the dashboard already computes
(valuation multiples, 5-axis snowflake scores, unrealized P&L, dividend
yield, anomalies, 30-day delta, today's move, news for that one symbol)
and ask Claude for four short labelled lines:

    Action:     <Consider adding / Consider trimming / Hold / ...>
    Why:        <plain-English reasoning grounded in the signals above>
    Confidence: <High | Medium | Low>
    Risk:       <the key risk / what would make this call wrong>

This is a direct recommendation surface — the user decides whether to act.
The grounding rule (recommend only from the signals given; thin signals →
Hold/Watch + Low confidence) plus the mandatory Confidence + Risk lines are
the safeguard against a confidently-wrong model. A slim anti-hype guard
(`FORBIDDEN_HYPE`) keeps the tone calm and blocks pump language. Engine
(client, guard, cache) lives in `api.advisor`.

If ANTHROPIC_API_KEY is missing the route returns 503; we never silently
fall back to a stub because that would be confusing inline with the
anomaly drill-in.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import advisor, dividends, fair_value, snowflake
from api.data import anomalies, prices
from api.data.moomoo_client import get_summary
from api.digest import _fetch_news
from api.i18n import DEFAULT_LOCALE, Locale

log = logging.getLogger(__name__)

# v5-source-edit (educational Meaning/Watch) → v6-recommend (2026-06-06):
# the dashboard dropped its educational-only guardrail. This surface now
# emits a direct recommendation (Action / Why / Confidence / Risk) grounded
# in the signals we pass.
_PROMPT_VERSION = "v6-recommend"

# Quiet fallback when both Claude attempts hit a hype word, or signals are
# too thin to call. Recommendation-shaped so the frontend renders uniformly.
_QUIET: dict[Locale, tuple[str, str, str, str]] = {
    "en": (
        "Hold",
        "Not enough fresh signal to make a confident call on this holding right now.",
        "Low",
        "Thin data; revisit after the next earnings update or material news.",
    ),
    "zh": (
        "持有",
        "目前该持仓的新信号不足，难以给出有把握的判断。",
        "Low",
        "数据有限；待下次财报或重要消息后再看。",
    ),
}


_LANG_INSTRUCTION: dict[Locale, str] = {
    "en": "\n\nRespond in English.\n",
    "zh": (
        "\n\n请使用简体中文撰写 Why 与 Risk 两行的正文。"
        "所有结构化标签（'Action:' / 'Why:' / 'Confidence:' / 'Risk:'）保持英文以便解析。"
        "Confidence 的取值也必须是英文 High / Medium / Low 三者之一。"
        "Action 一行可用中文表述（如 \"考虑加仓\"、\"考虑减仓\"、\"持有\"、\"观望\"）。"
        "采用零售投资者的朴素中文，避免术语。日期保留原英文（如 \"May 8\"）即可。\n"
    ),
}

_INSIGHT_PROMPT = """\
You are the analyst on a long-horizon retail investor's dashboard. For ONE
stock the reader holds, write a short, direct recommendation. The reader is
a first-year student who has never invested, so every word must be plain.

Output format, exact and machine-parsed, FOUR lines with these literal labels:

Action: <one of: Consider adding · Consider trimming · Hold · Consider starting a position · Consider exiting · Watch. Plain wording is fine; lead with the verb.>
Why: <one or two plain sentences. Justify the action using the SIGNALS BELOW: valuation vs market, the 5-axis scores, unrealized P&L, dividend yield, anomalies, 30-day move, news. Name the numbers you lean on.>
Confidence: <exactly one word: High, Medium, or Low.>
Risk: <one sentence: the main thing that could make this call wrong, or what to keep an eye on.>

Hard rules:
- EXACTLY four lines, labels spelled exactly "Action:", "Why:", "Confidence:", "Risk:".
- Each line ONE or two sentences, ≤30 words. Brevity is valued.
- GROUNDING: recommend ONLY from the signals provided below. Never invent a
  number, target, or fact you were not given. If the signals are thin,
  missing, or conflict, set Action to "Hold" or "Watch" and Confidence to
  "Low". A weak, honest call beats a confident guess.
- Confidence reflects how strong and aligned the signals are, not how much
  you like the stock. Several signals pointing the same way → High. Mixed or
  sparse → Low.
- Quote tickers, percentages, multiples, and currency figures verbatim.
- Calm, grounded tone. A recommendation is fine; hype is not. No guarantees,
  no certainty claims, no "to the moon".
- NEVER use em dashes (—). Use colons, commas, or periods.

Translate CONCEPTS into plain words. Never use the jargon on the left:
  Indicator overbought (RSI / KDJ / BIAS / MACD / CCI)
    → "the price has climbed fast and could cool off"
  Indicator oversold
    → "the price has fallen fast and could steady"
  Moving averages / MA / Bollinger Band / trend lines
    → "the recent price trend"
  Death cross / golden cross
    → "the recent trend has tilted down / up"
  Block-trade net inflows / outflows
    → "big institutions have been buying / selling"
  Short interest / short ratio
    → "bets that the price will fall"
  P/E, P/S, PEG
    → "how expensive the stock is versus its earnings / sales / growth"

How to read the signals:
- Valuation: a forward P/E, P/S, or PEG BELOW the US market is cheaper; ABOVE
  is pricier. A PEG near or below 1 is reasonable for the growth.
- Snowflake scores are 0 to 6 (higher is better) on Value, Future, Past,
  Health, Dividend. Use them as a quick read of strengths and weaknesses.
- A positive target-upside means analysts' average price target sits above
  today's price; negative means below.

If there is genuinely nothing to act on (flat price, no anomalies, no news,
neutral valuation), output:
  Action: Hold
  Why: Nothing in the current signals points to a change for this holding.
  Confidence: Low
  Risk: Watch for the next earnings update or material news.

Output the four lines only. No preamble, no markdown, no bullet characters.
"""

_SPEC = advisor.AdvisorSpec(
    surface="insight",
    prompt=_INSIGHT_PROMPT,
    prompt_version=_PROMPT_VERSION,
    ttl=timedelta(hours=6),
    max_tokens=500,
    lang_instruction=_LANG_INSTRUCTION,
)


@dataclass(frozen=True)
class Insight:
    code: str
    ticker: str
    action: str
    action_tone: str  # "positive" | "caution" | "neutral"
    why: str
    confidence: str  # "High" | "Medium" | "Low"
    risk: str
    generated_at: datetime
    cached: bool = False


# ── Signal collection (per-ticker) ──────────────────────────────────────────


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

    # Valuation multiples (cached 24h). Target-upside vs today's price.
    metrics = fair_value.get_metrics(pos.code)
    target_upside_pct = None
    if metrics.target_mean_price and pos.current_price:
        target_upside_pct = (metrics.target_mean_price - pos.current_price) / pos.current_price

    # 5-axis snowflake scores (no Claude — scoring only; anomalies are
    # session-cached so the health axis reuses the fetch above).
    try:
        scores = snowflake._compute_scores(
            pos.code, pos.total_pnl_pct, pos.current_price, pos.currency
        )
    except Exception as exc:  # scoring is best-effort enrichment
        log.warning("recommendation: snowflake scoring failed for %s: %s", pos.code, exc)
        scores = None

    # Dividend yield (cached). TTM per-share over current price.
    dividend_yield_pct = None
    try:
        div = dividends.get_one(pos.code)
        if div and pos.current_price:
            dividend_yield_pct = (div.ttm_per_share_native / pos.current_price) * 100
    except Exception as exc:
        log.warning("recommendation: dividend lookup failed for %s: %s", pos.code, exc)

    return {
        "ticker": pos.ticker,
        "code": pos.code,
        "name": pos.name,
        "currency": pos.currency,
        "current_price": pos.current_price,
        "today_pct": pos.today_change_pct,
        "delta_30d_pct": delta_30d_pct,
        "total_pnl_pct": pos.total_pnl_pct,
        "forward_pe": metrics.forward_pe,
        "price_to_sales": metrics.price_to_sales,
        "peg": metrics.peg,
        "target_upside_pct": target_upside_pct,
        "dividend_yield_pct": dividend_yield_pct,
        "scores": scores,
        "anomaly_lines": anomaly_lines,
        "news_lines": news_lines,
    }


def _format_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    sign = "+" if value > 0 else ""
    return f"{sign}{value * 100:.2f}%"


def _format_x(value: float | None) -> str:
    return f"{value:.1f}x" if value is not None else "n/a"


def _format_scores(scores) -> str:
    if scores is None:
        return "unavailable"

    def one(label: str, v) -> str:
        return f"{label} {v}/6" if v is not None else f"{label} n/a"

    return ", ".join(
        [
            one("Value", scores.valuation),
            one("Future", scores.future),
            one("Past", scores.past),
            one("Health", scores.health),
            one("Dividend", scores.dividends),
        ]
    )


def _build_user_message(s: dict) -> str:
    today = datetime.now().strftime("%A, %B %-d %Y")
    lines: list[str] = [
        f"Date: {today}",
        "",
        f"Stock: {s['ticker']} ({s['code']}, {s['name']})",
        (
            f"  Price: {s['currency']} {s['current_price']:.2f} · "
            f"today {_format_pct(s['today_pct'])} · "
            f"30-day {_format_pct(s['delta_30d_pct'])} · "
            f"your unrealized P&L {_format_pct(s['total_pnl_pct'])}"
        ),
        (
            f"  Valuation: forward P/E {_format_x(s['forward_pe'])}, "
            f"P/S {_format_x(s['price_to_sales'])}, "
            f"PEG {_format_x(s['peg'])}, "
            f"analyst target upside {_format_pct(s['target_upside_pct'])}"
        ),
        f"  Scores (0-6): {_format_scores(s['scores'])}",
        (
            f"  Dividend yield: {s['dividend_yield_pct']:.2f}%"
            if s["dividend_yield_pct"] is not None
            else "  Dividend yield: none"
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


# ── Parsing ─────────────────────────────────────────────────────────────────

_POSITIVE_KEYS = ("add", "buy", "start", "accumulat", "increas", "build", "加", "买", "增", "建仓")
_CAUTION_KEYS = ("trim", "sell", "exit", "reduc", "lighten", "cut", "减", "卖", "清", "降")


def classify_action_tone(action: str) -> str:
    """Map an action phrase to a chip tone. Defaults to neutral (hold/watch)."""
    low = action.lower()
    if any(k in low for k in _POSITIVE_KEYS):
        # "consider adding" → positive; but "don't add" is not produced by the prompt.
        return "positive"
    if any(k in low for k in _CAUTION_KEYS):
        return "caution"
    return "neutral"


def normalize_confidence(text: str) -> str:
    low = text.lower()
    if "high" in low or "高" in text:
        return "High"
    if "low" in low or "低" in text:
        return "Low"
    return "Medium"


def _parse_body(body: str) -> tuple[str, str, str, str]:
    action = why = confidence = risk = ""
    for raw in body.splitlines():
        line = raw.strip()
        low = line.lower()
        if low.startswith("action:"):
            action = line.split(":", 1)[1].strip()
        elif low.startswith("why:"):
            why = line.split(":", 1)[1].strip()
        elif low.startswith("confidence:"):
            confidence = line.split(":", 1)[1].strip()
        elif low.startswith("risk:"):
            risk = line.split(":", 1)[1].strip()
    return action, why, confidence, risk


# ── Public API ──────────────────────────────────────────────────────────────


def get_insight(
    code: str, force_refresh: bool = False, locale: Locale = DEFAULT_LOCALE
) -> Insight | None:
    """Return the per-stock recommendation, hitting the 6h cache unless
    force_refresh. Returns None if `code` isn't a current holding.
    """
    if not force_refresh:
        cached = advisor.load(_SPEC, code, locale)
        if cached is not None:
            payload, gen_at = cached
            return Insight(
                code=code,
                ticker=code.split(".", 1)[-1],
                action=payload["action"],
                action_tone=payload["action_tone"],
                why=payload["why"],
                confidence=payload["confidence"],
                risk=payload["risk"],
                generated_at=gen_at,
                cached=True,
            )

    signals = _collect_one(code)
    if signals is None:
        return None

    body = advisor.complete(_SPEC, _build_user_message(signals), locale)
    if body is None:
        action, why, confidence, risk = _QUIET[locale]
    else:
        action, why, confidence, risk = _parse_body(body)
        if not action or not risk:
            log.warning(
                "recommendation: missing %s line, quieting (locale=%s)",
                "Action" if not action else "Risk", locale,
            )
            action, why, confidence, risk = _QUIET[locale]

    insight = Insight(
        code=code,
        ticker=signals["ticker"],
        action=action,
        action_tone=classify_action_tone(action),
        why=why,
        confidence=normalize_confidence(confidence),
        risk=risk,
        generated_at=datetime.now(),
    )
    advisor.save(
        _SPEC,
        code,
        {
            "action": insight.action,
            "action_tone": insight.action_tone,
            "why": insight.why,
            "confidence": insight.confidence,
            "risk": insight.risk,
        },
        locale,
    )
    return insight

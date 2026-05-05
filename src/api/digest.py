"""AI daily digest. Collects per-holding signals and asks Claude to
summarize what materially changed today.

Signals fed into the prompt:
  A. Anomalies — moomoo `get_technical_unusual` + `get_financial_unusual`
     prose (already in English) via api.data.anomalies.fetch_all.
  B. Price moves — today's % change + 30-day delta from the cached
     daily-bars in prices.duckdb.
  C. News headlines — yfinance `Ticker.news` (3 most recent per holding).

Cached in `prices.duckdb`, table `digest_cache`, key `'current'`. 6h TTL.
The cache uses the same single-writer DuckDB connection as prices.py per
the CLAUDE.md guarantee.

The model gets a structured per-holding block; the prompt is the lever
the user tunes for voice / length / restraint.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from api.data import anomalies, prices
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)

# ── Tuning surface ──────────────────────────────────────────────────────────
# This is the dial the user reaches for. Voice + restraint live here.
# Trade-offs to consider when editing:
#   • Length — currently 3-5 sentences. Shorten for glance, lengthen for
#     weekend-study mode. The dashboard has both modes; pick one or stage two.
#   • Order — most-important-first. The opening sentence sets the day.
#   • Causal claims — forbidden unless a headline states the cause. Without
#     this guard the model invents narratives ("rose on AI optimism").
#   • Voice — observation, not advice. PRODUCT.md says "signals not commands".
#   • Anti-patterns — no buy/sell/hold, no targets, no projections, no hype.
#
# Keep the prompt compact: every token here is paid on every uncached call.
# Bumped whenever _DIGEST_PROMPT is rewritten so cached prose generated
# under an older voice doesn't get served. The single-row digest_cache
# table will be overwritten on the next ?refresh=true.
_PROMPT_VERSION = "v5-no-em-dash"

_DIGEST_PROMPT = """\
You are writing today's portfolio digest for a complete beginner: a
first-year student who has never invested before. Use plain everyday
English. Keep it SHORT. This is a top-of-page summary; deeper
explanation lives in each holding's detail panel.

Output format, exact and machine-parsed:

LEAD: <one sentence on the day at the portfolio level: the single thing the reader should take away.>

<TICKER>: <one short sentence on what happened to this holding today.>
<TICKER>: <one short sentence on what happened to this holding today.>
...

Hard rules:
- LEAD is mandatory and always first; ≤25 words.
- Each ticker line is ONE short sentence, ≤20 words. Aim for 12.
- Use the exact ticker symbol from the input (MU, INTC, K71U).
- Skip any holding with flat price today AND no news AND no anomaly.
  Skip silently. Don't write "nothing notable". Absence is the signal.
- Quote tickers, percentages, currency figures verbatim from the input.
- Lead each ticker line with a concrete fact ("MU held flat today",
  "K71U rose 1.12%"), not an indicator name.
- Make a causal claim only if a headline in the input states the cause.
- NEVER use em dashes (—) in any output line. Use colons, commas, or
  periods instead.

NEVER use these action words:
  buy / sell / hold / trim / add / target / forecast / predict / expect /
  recommend / "you should" / "you ought" / "consider [verb]" / "tomorrow".

NEVER use these hype words:
  surge / plunge / soar / crash / breakout / rally / tank.

Use instead: rose / fell / moved / held steady / edged up / slowed / cooled.

Translate CONCEPTS, not just words. Never use these terms; translate
them to the everyday meaning on the right:

  Indicator overbought (RSI / KDJ / BIAS / MACD / CCI)
    → "the price has climbed fast and could slow soon"
  Indicator oversold
    → "the price has fallen fast and could steady soon"
  Moving averages / MA5 / MA10 / MA20 / Bollinger Band / trend lines
    → "the recent price trend"
  Death cross / golden cross
    → "the recent trend has shifted slightly down / up"
  Bullish / bearish alignment
    → "trending up / trending down"
  Block-trade net inflows / outflows
    → "big institutions have been buying / selling"
  Decelerated by N%
    → "but slower than before (N% slower)"
  Short interest / short ratio
    → "bets that the price will fall"
  Perpetual securities / perpetual bonds
    → "raised long-term funding"

Tone: matter-of-fact, calm. Like writing one line in a personal ledger,
not a market commentary. Every word should earn its place; this is the
short summary, and deeper teaching happens elsewhere.

Output the digest only. No preamble, no markdown, no bullet characters.
"""

# ── Cache ────────────────────────────────────────────────────────────────────
_TTL = timedelta(hours=6)
_NEWS_CACHE: dict[str, tuple[list[dict], datetime]] = {}
_NEWS_TTL = timedelta(hours=2)
_NEWS_LOCK = threading.Lock()


@dataclass(frozen=True)
class Digest:
    prose: str
    generated_at: datetime
    holdings_covered: tuple[str, ...]
    cached: bool = False


# ── Symbol mapping (moomoo code → yfinance symbol) ──────────────────────────


def _to_yfinance_symbol(code: str) -> str | None:
    """Convert moomoo's `MARKET.TICKER` to yfinance's symbol.

    Examples: US.MU → MU, HK.00700 → 0700.HK, SG.K71U → K71U.SI.
    Returns None for markets we can't map (yfinance has no consistent
    coverage outside US/HK/SG/CN/JP).
    """
    if "." not in code:
        return code
    market, ticker = code.split(".", 1)
    market = market.upper()
    if market == "US":
        return ticker
    if market == "HK":
        return f"{ticker.zfill(4)}.HK"
    if market == "SG":
        return f"{ticker}.SI"
    if market == "JP":
        return f"{ticker}.T"
    if market == "CN":
        # Shanghai 6xxxxx → .SS, Shenzhen 0xxxxx/3xxxxx → .SZ.
        if ticker.startswith("6"):
            return f"{ticker}.SS"
        return f"{ticker}.SZ"
    return None


# ── News fetch (yfinance) ────────────────────────────────────────────────────


def _fetch_news(code: str, limit: int = 3) -> list[dict]:
    """Top N most recent headlines for a holding. yfinance returns a
    list of dicts; we normalize to {title, publisher, ts}.

    Cached per session (2h) so a digest refresh doesn't refetch news.
    """
    with _NEWS_LOCK:
        cached = _NEWS_CACHE.get(code)
        if cached and (datetime.now() - cached[1]) < _NEWS_TTL:
            return cached[0]

    symbol = _to_yfinance_symbol(code)
    if not symbol:
        return []

    try:
        import yfinance as yf

        items = yf.Ticker(symbol).news or []
    except Exception as exc:
        log.warning("yfinance news fetch %s failed: %s", code, exc)
        return []

    out: list[dict] = []
    for item in items[:limit]:
        # yfinance has shipped two response shapes; cover both.
        content = item.get("content") if isinstance(item, dict) else None
        if isinstance(content, dict):
            title = content.get("title") or ""
            publisher = (content.get("provider") or {}).get("displayName") or ""
            ts = content.get("pubDate") or ""
        else:
            title = item.get("title", "") if isinstance(item, dict) else ""
            publisher = item.get("publisher", "") if isinstance(item, dict) else ""
            unix = item.get("providerPublishTime") if isinstance(item, dict) else None
            ts = (
                datetime.fromtimestamp(unix).isoformat()
                if isinstance(unix, (int, float))
                else ""
            )
        if title:
            out.append({"title": title, "publisher": publisher, "ts": ts})

    with _NEWS_LOCK:
        _NEWS_CACHE[code] = (out, datetime.now())
    return out


# ── Signal collection ───────────────────────────────────────────────────────


def _collect_signals() -> tuple[list[dict], tuple[str, ...]]:
    """Build a per-holding signal block. Returns (signals, tickers_covered)."""
    summary = get_summary()
    signals: list[dict] = []
    tickers: list[str] = []

    for p in summary.positions:
        # Anomalies (technical + capital flow), already rewritten in plain
        # English by anomaly_translator. Keeps the digest's voice consistent
        # with the drill-in the reader will see if they expand a row.
        anomaly_lines = [
            f"  - {a.label}: {a.content.strip()}"
            for a in anomalies.fetch_all_plain(p.code)
            if a.has_content
        ]

        # 30-day delta from cached close series.
        closes = prices.get_close_series(p.code, days=30)
        delta_30d_pct: float | None = None
        if len(closes) >= 2 and closes[0]:
            delta_30d_pct = (closes[-1] - closes[0]) / closes[0]

        # News.
        news = _fetch_news(p.code)
        news_lines = [
            f"  - \"{n['title']}\" ({n['publisher']})" for n in news
        ]

        signals.append(
            {
                "ticker": p.ticker,
                "code": p.code,
                "name": p.name,
                "currency": p.currency,
                "current_price": p.current_price,
                "today_pct": p.today_change_pct,
                "delta_30d_pct": delta_30d_pct,
                "anomaly_lines": anomaly_lines,
                "news_lines": news_lines,
            }
        )
        tickers.append(p.ticker)

    return signals, tuple(tickers)


def _format_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    sign = "+" if value > 0 else ("" if value == 0 else "")
    return f"{sign}{value * 100:.2f}%"


def _build_user_message(signals: list[dict]) -> str:
    """Render signals into a single user-message block for Claude."""
    today = datetime.now().strftime("%A, %B %-d %Y")
    lines: list[str] = [f"Date: {today}", "", "Portfolio signals:"]

    for s in signals:
        lines.append("")
        lines.append(f"{s['ticker']} ({s['code']}, {s['name']})")
        lines.append(
            f"  Price: {s['currency']} {s['current_price']:.2f} · "
            f"today {_format_pct(s['today_pct'])} · "
            f"30-day {_format_pct(s['delta_30d_pct'])}"
        )
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


def _call_claude(user_message: str) -> str:
    """Send the system prompt + signal block to Claude and return prose."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY not set — add it to .env to enable /api/digest."
        )

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_DIGEST_MODEL", "claude-sonnet-4-6")

    response = client.messages.create(
        model=model,
        max_tokens=512,
        system=_DIGEST_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    parts = [block.text for block in response.content if block.type == "text"]
    return "\n".join(parts).strip()


# ── DuckDB cache (single-writer, shared with prices.py) ─────────────────────


def _ensure_cache_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS digest_cache (
                cache_key VARCHAR PRIMARY KEY,
                prose VARCHAR,
                holdings_covered VARCHAR,
                generated_at TIMESTAMP
            )
            """
        )


def _load_cached() -> Digest | None:
    _ensure_cache_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT prose, holdings_covered, generated_at "
            "FROM digest_cache WHERE cache_key = 'current'"
        ).fetchone()
    if not row:
        return None
    prose, covered_csv, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return Digest(
        prose=prose,
        generated_at=generated_at,
        holdings_covered=tuple(covered_csv.split(",")) if covered_csv else (),
        cached=True,
    )


def _save_cache(digest: Digest) -> None:
    _ensure_cache_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO digest_cache VALUES (?, ?, ?, ?)",
            [
                "current",
                digest.prose,
                ",".join(digest.holdings_covered),
                digest.generated_at,
            ],
        )


# ── Public API ──────────────────────────────────────────────────────────────


def get_digest(force_refresh: bool = False) -> Digest:
    """Return the current digest, hitting the 6h cache unless force_refresh."""
    if not force_refresh:
        cached = _load_cached()
        if cached is not None:
            return cached

    signals, tickers = _collect_signals()
    if not signals:
        # Empty book — return a quiet sentence rather than calling Claude.
        return Digest(
            prose="No open positions today.",
            generated_at=datetime.now(),
            holdings_covered=(),
        )

    user_message = _build_user_message(signals)
    prose = _call_claude(user_message)
    digest = Digest(
        prose=prose,
        generated_at=datetime.now(),
        holdings_covered=tickers,
    )
    _save_cache(digest)
    return digest

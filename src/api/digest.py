"""AI daily digest — per-ticker four-tile grid.

Orchestrates four analyst modules (Fundamentals · News · Sentiment ·
Technical) per holding. Each tile is one Claude call producing one
observation-only sentence ≤22 words. The shared analyst code lives in
`api.analysts._base`; data prep lives in each tile module.

Borrows the role-decomposition pattern from TauricResearch/TradingAgents
(prompt structure only — no LangGraph, no debate, no Trader synthesis,
no action language).

Cache: `digest_tiles_cache` table in `prices.duckdb`, keyed on
`(code, prompt_version)`. 6h TTL, single-writer via `prices._DB_LOCK`.
The old single-blob `digest_cache` table is left in place — harmless
residue, no longer read.

Concurrency: per-ticker, 4 tiles fan out via `asyncio.gather`. Across
tickers, a `Semaphore(4)` keeps Claude QPS sane — 4 holdings × 4 tiles
in flight at most, ≈16 concurrent Claude calls.

The `_fetch_news` helper is re-exported here because the news + sentiment
analysts import it lazily.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta

from api.analysts import fundamentals, news, sentiment, technical
from api.analysts._base import AnalystOutput
from api.data import prices
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)

# v2 → v3 (2026-05-07): tightened FORBIDDEN_BASE with magnitude qualifiers
# + added "report numbers, don't characterize" example pair to template.
# v3 → v4 (2026-05-09): banned indicator-behavior tokens (momentum,
# decelerat, mover) — leaked through v3 in MU/INTC technical, ANET news.
_PROMPT_VERSION = "v4"
_TTL = timedelta(hours=6)

# Bound across-ticker concurrency. 4 tickers × 4 tiles = 16 inflight calls
# at most, well under typical Claude rate ceilings.
_TICKER_SEMAPHORE = asyncio.Semaphore(4)

# News fetch cache (used by analysts/news.py + analysts/sentiment.py).
_NEWS_CACHE: dict[str, tuple[list[dict], datetime]] = {}
_NEWS_TTL = timedelta(hours=2)
_NEWS_LOCK = threading.Lock()


@dataclass(frozen=True)
class TickerTiles:
    code: str
    ticker: str
    name: str
    fundamentals: str
    news: str
    sentiment: str
    technical: str
    fundamentals_quiet: bool = False
    news_quiet: bool = False
    sentiment_quiet: bool = False
    technical_quiet: bool = False


def _is_quiet_sentence(sentence: str) -> bool:
    # Mirrors `analysts._base._quiet()` — only path that yields this prefix.
    return sentence.startswith("Quiet on ")


@dataclass(frozen=True)
class AnalystTiledDigest:
    generated_at: datetime
    holdings: list[TickerTiles]
    cached: bool = False


# ── Symbol mapping (moomoo code → yfinance symbol) ──────────────────────────


def _to_yfinance_symbol(code: str) -> str | None:
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
        if ticker.startswith("6"):
            return f"{ticker}.SS"
        return f"{ticker}.SZ"
    return None


# ── News fetch (yfinance) — shared across analysts/news + analysts/sentiment


def _fetch_news(code: str, limit: int = 3) -> list[dict]:
    """Top N most recent headlines for a holding. Cached per session 2h."""
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


# ── DuckDB cache (single-writer, shared with prices.py) ─────────────────────


def _ensure_cache_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS digest_tiles_cache (
                code VARCHAR NOT NULL,
                prompt_version VARCHAR NOT NULL,
                fundamentals VARCHAR,
                news VARCHAR,
                sentiment VARCHAR,
                technical VARCHAR,
                generated_at TIMESTAMP,
                PRIMARY KEY (code, prompt_version)
            )
            """
        )


def _load_cached_tiles(code: str) -> tuple[str, str, str, str, datetime] | None:
    _ensure_cache_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT fundamentals, news, sentiment, technical, generated_at "
            "FROM digest_tiles_cache "
            "WHERE code = ? AND prompt_version = ?",
            [code, _PROMPT_VERSION],
        ).fetchone()
    if not row:
        return None
    fundamentals, news_, sentiment_, technical_, generated_at = row
    if datetime.now() - generated_at > _TTL:
        return None
    return fundamentals, news_, sentiment_, technical_, generated_at


def _save_cached_tiles(tiles: TickerTiles, generated_at: datetime) -> None:
    _ensure_cache_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO digest_tiles_cache VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                tiles.code,
                _PROMPT_VERSION,
                tiles.fundamentals,
                tiles.news,
                tiles.sentiment,
                tiles.technical,
                generated_at,
            ],
        )


# ── Per-ticker orchestration ────────────────────────────────────────────────


async def _build_tiles_one(code: str, ticker: str, name: str, currency: str) -> TickerTiles:
    """Cache-first, then 4-tile fan-out. All four analysts run concurrently."""
    cached = _load_cached_tiles(code)
    if cached is not None:
        f, n, s, t, _gen_at = cached
        return TickerTiles(
            code=code, ticker=ticker, name=name,
            fundamentals=f, news=n, sentiment=s, technical=t,
            fundamentals_quiet=_is_quiet_sentence(f),
            news_quiet=_is_quiet_sentence(n),
            sentiment_quiet=_is_quiet_sentence(s),
            technical_quiet=_is_quiet_sentence(t),
        )

    async with _TICKER_SEMAPHORE:
        # Each analyst's get_take is sync (Claude SDK is sync). Wrap in
        # to_thread so the four calls actually run concurrently rather
        # than serializing on the event loop.
        results: list[AnalystOutput] = await asyncio.gather(
            asyncio.to_thread(fundamentals.get_take, code, ticker, name, currency),
            asyncio.to_thread(news.get_take, code, ticker, name),
            asyncio.to_thread(sentiment.get_take, code, ticker, name),
            asyncio.to_thread(technical.get_take, code, ticker, name),
        )

    tiles = TickerTiles(
        code=code,
        ticker=ticker,
        name=name,
        fundamentals=results[0].sentence,
        news=results[1].sentence,
        sentiment=results[2].sentence,
        technical=results[3].sentence,
        fundamentals_quiet=results[0].is_quiet,
        news_quiet=results[1].is_quiet,
        sentiment_quiet=results[2].is_quiet,
        technical_quiet=results[3].is_quiet,
    )
    _save_cached_tiles(tiles, datetime.now())
    return tiles


# ── Public API ──────────────────────────────────────────────────────────────


async def get_digest_async(force_refresh: bool = False) -> AnalystTiledDigest:
    """Return per-ticker tile grid. If `force_refresh`, bypass the 6h cache."""
    summary = get_summary()
    if not summary.positions:
        return AnalystTiledDigest(
            generated_at=datetime.now(),
            holdings=[],
        )

    if force_refresh:
        # Drop cache rows for current holdings so the next save overwrites.
        codes = [p.code for p in summary.positions]
        _ensure_cache_table()
        with prices._DB_LOCK:
            prices._db().execute(
                "DELETE FROM digest_tiles_cache WHERE prompt_version = ? AND code IN ("
                + ",".join("?" for _ in codes)
                + ")",
                [_PROMPT_VERSION, *codes],
            )

    # Snapshot cache state BEFORE fan-out so `cached` reflects whether work
    # was done, not the post-write state (every ticker is "cached" after save).
    pre_cached = not force_refresh and all(
        _load_cached_tiles(p.code) is not None for p in summary.positions
    )

    # Fan out across holdings; each call is independent.
    tiles_list = await asyncio.gather(
        *(
            _build_tiles_one(p.code, p.ticker, p.name, p.currency)
            for p in summary.positions
        )
    )

    return AnalystTiledDigest(
        generated_at=datetime.now(),
        holdings=list(tiles_list),
        cached=pre_cached,
    )


async def warm_cache() -> None:
    """Pre-warm the digest tile cache at FastAPI startup.

    Cache-first: only fires Claude calls for tiles missing from
    `digest_tiles_cache` (or expired by the 6h TTL). Subsequent
    `/api/digest` requests then hit the cache and respond in
    milliseconds instead of the cold-start ~50s of 5×4 Claude calls.

    Safe to crash/no-op: missing ANTHROPIC_API_KEY, no positions
    (e.g. moomoo not yet connected), or any other failure logs and
    returns — the lifespan must not block on Claude availability.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        log.info("digest cache warm: skipped (ANTHROPIC_API_KEY not set)")
        return
    started = datetime.now()
    try:
        d = await get_digest_async(force_refresh=False)
    except Exception:
        log.exception("digest cache warm failed")
        return
    elapsed = (datetime.now() - started).total_seconds()
    state = "all cached" if d.cached else "fresh tiles built"
    log.info(
        "digest cache warm: %d holdings, %s, %.1fs",
        len(d.holdings),
        state,
        elapsed,
    )


def get_digest(force_refresh: bool = False) -> AnalystTiledDigest:
    """Sync wrapper for the route handler. Spins an event loop if needed."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None:
        # Already inside an event loop (shouldn't happen in our sync route,
        # but guard anyway). Fall through to a new loop in a thread.
        return asyncio.run_coroutine_threadsafe(
            get_digest_async(force_refresh), loop
        ).result()
    return asyncio.run(get_digest_async(force_refresh))

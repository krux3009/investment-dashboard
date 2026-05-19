"""Sector / industry / geography breakdown for `/portfolio` Analysis tab.

yfinance's `Ticker.info` is the only practical source for sector +
country metadata, but it routinely hangs on rate-limit. Every fetch
runs inside a ThreadPoolExecutor with a hard 5s timeout; on timeout
the holding lands with `sector=None, country=None` and the cache
records a short-lived empty marker so we don't re-hammer the same
ticker on the next request.

Cache: `portfolio_metadata_cache (code, payload_json, fetched_at)`
PK code, 24h TTL on successful payloads, 10min TTL on empty markers.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dataclasses import dataclass
from datetime import datetime, timedelta

from api.data import prices
from api.data.moomoo_client import get_summary
from api.dividends import _to_yfinance_symbol
from api.holdings_payload import build_holdings_response

log = logging.getLogger(__name__)

_TTL_OK = timedelta(hours=24)
_TTL_EMPTY = timedelta(minutes=10)
_INFO_TIMEOUT_S = 5.0

_REGION_BY_COUNTRY: dict[str, str] = {
    "United States": "N.America", "Canada": "N.America",
    "United Kingdom": "Europe", "Germany": "Europe", "France": "Europe",
    "Switzerland": "Europe", "Netherlands": "Europe", "Ireland": "Europe",
    "Sweden": "Europe", "Spain": "Europe", "Italy": "Europe",
    "China": "Asia-Pacific", "Hong Kong": "Asia-Pacific",
    "Japan": "Asia-Pacific", "South Korea": "Asia-Pacific",
    "Korea": "Asia-Pacific", "Singapore": "Asia-Pacific",
    "Taiwan": "Asia-Pacific", "Australia": "Asia-Pacific",
    "New Zealand": "Asia-Pacific", "Malaysia": "Asia-Pacific",
    "Indonesia": "Asia-Pacific", "Thailand": "Asia-Pacific",
    "India": "Asia-Pacific",
}


@dataclass(frozen=True)
class HoldingMetadata:
    code: str
    sector: str | None
    industry: str | None
    country: str | None
    region: str | None


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS portfolio_metadata_cache (
                code VARCHAR PRIMARY KEY,
                payload_json VARCHAR,
                fetched_at TIMESTAMP
            )
            """
        )


def _load_cached(code: str) -> HoldingMetadata | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT payload_json, fetched_at FROM portfolio_metadata_cache WHERE code = ?",
            [code],
        ).fetchone()
    if not row:
        return None
    payload_json, fetched_at = row
    payload = json.loads(payload_json) if payload_json else {}
    has_data = bool(payload.get("sector") or payload.get("country"))
    age = datetime.now() - fetched_at
    if has_data and age > _TTL_OK:
        return None
    if not has_data and age > _TTL_EMPTY:
        return None
    country = payload.get("country")
    return HoldingMetadata(
        code=code,
        sector=payload.get("sector"),
        industry=payload.get("industry"),
        country=country,
        region=_REGION_BY_COUNTRY.get(country, "ROW") if country else None,
    )


def _save_cache(meta: HoldingMetadata) -> None:
    _ensure_table()
    payload = json.dumps({
        "sector": meta.sector, "industry": meta.industry, "country": meta.country,
    })
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO portfolio_metadata_cache VALUES (?, ?, ?)",
            [meta.code, payload, datetime.now()],
        )


def _fetch_info_keys(symbol: str, keys: tuple[str, ...]) -> dict:
    """Pull a small slice of Ticker.info with a hard timeout.

    Returns {} on timeout or yfinance failure so the caller can cache
    the empty marker.
    """
    import yfinance as yf

    def _work() -> dict:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
        return {k: info.get(k) for k in keys}

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_work)
        try:
            return future.result(timeout=_INFO_TIMEOUT_S)
        except FuturesTimeout:
            log.info("portfolio_metrics: Ticker.info timeout for %s", symbol)
            return {}
        except Exception as exc:
            log.warning("portfolio_metrics: Ticker.info failed for %s: %s", symbol, exc)
            return {}


def _fetch_metadata(code: str) -> HoldingMetadata:
    symbol = _to_yfinance_symbol(code)
    if symbol is None:
        meta = HoldingMetadata(code=code, sector=None, industry=None, country=None, region=None)
        _save_cache(meta)
        return meta

    info = _fetch_info_keys(symbol, ("sector", "industry", "country"))
    country = info.get("country")
    meta = HoldingMetadata(
        code=code,
        sector=info.get("sector"),
        industry=info.get("industry"),
        country=country,
        region=_REGION_BY_COUNTRY.get(country, "ROW") if country else None,
    )
    _save_cache(meta)
    return meta


def get_metadata(code: str) -> HoldingMetadata:
    cached = _load_cached(code)
    if cached is not None:
        return cached
    return _fetch_metadata(code)


def _per_holding_weights() -> list[tuple[str, str, float, float]]:
    """Returns [(code, name, weight_pct, value_usd) ...] sorted by weight desc."""
    summary = get_summary()
    response = build_holdings_response(summary)
    total = response.total_market_value_usd or 1.0
    rows = [
        (h.code, h.name or h.ticker, (h.market_value_usd or 0.0) / total * 100.0, h.market_value_usd or 0.0)
        for h in response.holdings
    ]
    rows.sort(key=lambda r: r[2], reverse=True)
    return rows


def get_sectors() -> list[dict]:
    """Sector rollup. Sub-industries collapsed into one bucket per sector
    (no sunburst until we have ≥20 holdings to justify it)."""
    rows = _per_holding_weights()
    buckets: dict[str, dict] = {}
    for code, name, weight_pct, value_usd in rows:
        meta = get_metadata(code)
        key = meta.sector or "Unclassified"
        bucket = buckets.setdefault(key, {"sector": key, "weight_pct": 0.0, "tickers": []})
        bucket["weight_pct"] += weight_pct
        bucket["tickers"].append({
            "code": code,
            "name": name,
            "weight_pct": weight_pct,
            "industry": meta.industry,
        })
    return sorted(buckets.values(), key=lambda b: b["weight_pct"], reverse=True)


def get_geography() -> list[dict]:
    rows = _per_holding_weights()
    buckets: dict[str, dict] = {}
    for code, name, weight_pct, value_usd in rows:
        meta = get_metadata(code)
        region = meta.region or "ROW"
        bucket = buckets.setdefault(region, {"region": region, "weight_pct": 0.0, "tickers": []})
        bucket["weight_pct"] += weight_pct
        bucket["tickers"].append({
            "code": code,
            "name": name,
            "weight_pct": weight_pct,
            "country": meta.country,
        })
    return sorted(buckets.values(), key=lambda b: b["weight_pct"], reverse=True)


def get_top_holdings(n: int = 10) -> list[dict]:
    rows = _per_holding_weights()[:n]
    return [
        {"code": code, "name": name, "weight_pct": weight_pct, "value_usd": value_usd}
        for code, name, weight_pct, value_usd in rows
    ]

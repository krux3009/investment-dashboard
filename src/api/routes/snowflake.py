"""GET /api/snowflake/{code}: per-holding scoring + Claude statements.
GET /api/snowflake/portfolio: USD-weighted aggregate over the book.

Wraps api.snowflake. Both endpoints render usable output without an
Anthropic key — `statements` collapses to empty arrays per axis when
the key is missing; the deterministic scores still ship.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api import snowflake
from api.i18n import parse_locale

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/snowflake/portfolio")
def get_portfolio_snowflake(locale: str = Query("en")) -> dict:
    loc = parse_locale(locale)
    snow = snowflake.get_for_portfolio(locale=loc)
    return snowflake.portfolio_snowflake_to_dict(snow)


@router.get("/snowflake/{code:path}")
def get_code_snowflake(
    code: str,
    refresh: bool = Query(False),
    locale: str = Query("en"),
) -> dict:
    loc = parse_locale(locale)
    try:
        snow = snowflake.get_for_code(code, force_refresh=refresh, locale=loc)
    except Exception as exc:
        log.exception("snowflake generation failed for %s", code)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if snow is None:
        return {
            "code": code,
            "ticker": code.split(".", 1)[-1],
            "scores": {
                "past": None,
                "health": None,
                "dividends": None,
                "valuation": None,
                "future": None,
            },
            "statements": {"past": [], "health": [], "dividend": []},
            "generated_at": "",
            "cached": False,
            "available": False,
        }
    payload = snowflake.snowflake_to_dict(snow)
    payload["available"] = True
    return payload

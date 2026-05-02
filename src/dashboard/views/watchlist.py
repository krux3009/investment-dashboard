"""Watchlist view — research surface for tickers under consideration.

Lean v1: hardcoded list of three tickers plus an env override. Renders a
compact table under the holdings view with: ticker · last · 30d change ·
sparkline. No drill-in, no anomaly fetch, no per-row poll. The user can
swap tickers in/out via MOOMOO_WATCHLIST in `.env`.

Reuses the sparkline component from holdings.py (single-trace Plotly
line chart in the same warm-graphite tints) and the prices cache
(`data/prices.py`) so adding tickers here doesn't pay the moomoo cost
twice if they're also held positions.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import plotly.graph_objects as go
from dash import dcc, html

from dashboard import theme
from dashboard.data import prices

log = logging.getLogger(__name__)

# Cold-start fallback when both the env override and moomoo's group fetch
# come up empty. Used essentially never in practice — the dashboard's
# normal source is the user's moomoo "All" group.
_DEFAULT_WATCHLIST = ["US.NVDA", "US.TSLA", "HK.00700"]

# Session-level cache of the moomoo-fetched watchlist. Populated on first
# call; a dashboard restart picks up any composition changes the user
# made in moomoo's app since.
_WATCHLIST_CACHE: list[str] | None = None


def _fetch_user_watchlist() -> list[str] | None:
    """Pull codes from a moomoo user-security group (default 'All').

    Returns None on any failure so the caller can fall back to the env
    override or hardcoded default. The user has no CUSTOM-typed groups
    on this machine; SYSTEM groups like 'All' / 'Favorites' / per-market
    are sufficient. 'Favorites' is empty by default in moomoo, which is
    why we default to 'All'.
    """
    group = os.environ.get("MOOMOO_WATCHLIST_GROUP", "All")
    try:
        from dashboard.data import anomalies

        ret, data = anomalies._quote_ctx().get_user_security(group)  # noqa: SLF001
    except Exception as exc:
        log.warning("get_user_security(%s) exception: %s", group, exc)
        return None
    if ret != 0 or not hasattr(data, "iterrows") or len(data) == 0:
        return None
    return [str(row["code"]) for _, row in data.iterrows()]


def _watchlist_codes() -> list[str]:
    """Resolve the watchlist via env > moomoo group > hardcoded fallback."""
    raw = os.environ.get("MOOMOO_WATCHLIST", "").strip()
    if raw:
        return [c.strip() for c in raw.split(",") if c.strip()]

    global _WATCHLIST_CACHE
    if _WATCHLIST_CACHE is None:
        fetched = _fetch_user_watchlist()
        if fetched:
            _WATCHLIST_CACHE = fetched
    if _WATCHLIST_CACHE:
        return _WATCHLIST_CACHE

    return _DEFAULT_WATCHLIST


def _label_style() -> dict:
    return {
        "fontSize": theme.TYPE["label"]["size"],
        "fontWeight": theme.TYPE["label"]["weight"],
        "letterSpacing": theme.TYPE["label"]["tracking"],
        "textTransform": "uppercase",
        "color": theme.QUIET_INK,
        "margin": 0,
    }


def _sparkline(closes: list[float], width: int = 90, height: int = 22) -> Any:
    if not closes or len(closes) < 2:
        return html.Span("–", style={"color": theme.QUIET_INK})

    delta = closes[-1] - closes[0]
    line_color = (
        theme.GAIN_HEX if delta > 0
        else theme.LOSS_HEX if delta < 0
        else theme.QUIET_INK_HEX
    )

    fig = go.Figure(
        go.Scatter(
            y=closes,
            mode="lines",
            line=dict(color=line_color, width=1.5),
            hoverinfo="skip",
        )
    )
    fig.update_layout(
        showlegend=False,
        margin=dict(l=0, r=0, t=2, b=2),
        height=height,
        width=width,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        xaxis=dict(visible=False, fixedrange=True),
        yaxis=dict(visible=False, fixedrange=True),
    )
    return dcc.Graph(
        figure=fig,
        config={"displayModeBar": False, "staticPlot": True},
        style={"width": f"{width}px", "height": f"{height}px"},
    )


def _ticker_display(code: str) -> str:
    """'US.NVDA' → 'NVDA', 'HK.00700' → '00700'."""
    return code.split(".", 1)[1] if "." in code else code


def _market_tag(code: str) -> str:
    """'US.NVDA' → 'US', 'HK.00700' → 'HK'."""
    return code.split(".", 1)[0] if "." in code else "?"


def _format_pct(value: float | None, decimals: int = 1) -> str:
    if value is None:
        return "–"
    if value == 0:
        return "0.0%"
    sign = "+" if value > 0 else "−"
    return f"{sign}{abs(value) * 100:.{decimals}f}%"


def _arrow(value: float | None) -> str:
    if value is None or value == 0:
        return "–"
    return "↑" if value > 0 else "↓"


def _row(code: str) -> html.Tr:
    closes = prices.get_close_series(code, days=30)
    if not closes:
        # No history (e.g. unknown SG ticker) — render the row but quiet ink.
        return html.Tr(
            children=[
                html.Td(
                    _ticker_display(code),
                    style={"padding": f"{theme.SPACE['md']} {theme.SPACE['md']} {theme.SPACE['md']} 0", "color": theme.QUIET_INK},
                ),
                html.Td("–", style={"textAlign": "right", "color": theme.QUIET_INK}),
                html.Td("–", style={"textAlign": "right", "color": theme.QUIET_INK}),
                html.Td("–", style={"textAlign": "right", "color": theme.QUIET_INK}),
            ],
        )

    last = closes[-1]
    delta_30d = (closes[-1] - closes[0]) / closes[0] if closes[0] else None
    today_pct = (
        (closes[-1] - closes[-2]) / closes[-2]
        if len(closes) >= 2 and closes[-2]
        else None
    )

    delta_color = (
        theme.GAIN if (delta_30d or 0) > 0
        else theme.LOSS if (delta_30d or 0) < 0
        else theme.QUIET_INK
    )

    return html.Tr(
        className="watchlist-row",
        children=[
            html.Td(
                children=[
                    html.Span(_ticker_display(code), style={"fontWeight": 400}),
                    html.Span(
                        _market_tag(code),
                        style={
                            "fontSize": "0.7rem",
                            "letterSpacing": "0.06em",
                            "color": theme.QUIET_INK,
                            "marginLeft": theme.SPACE["sm"],
                        },
                    ),
                ],
                style={"padding": f"{theme.SPACE['md']} {theme.SPACE['md']} {theme.SPACE['md']} 0", "textAlign": "left"},
            ),
            html.Td(
                f"${last:,.2f}",
                style={"padding": f"{theme.SPACE['md']} {theme.SPACE['md']} {theme.SPACE['md']} 0", "textAlign": "right", "whiteSpace": "nowrap"},
            ),
            html.Td(
                children=[
                    html.Span(_arrow(delta_30d), style={"marginRight": "0.3em"}),
                    html.Span(_format_pct(delta_30d)),
                ],
                style={
                    "padding": f"{theme.SPACE['md']} {theme.SPACE['md']} {theme.SPACE['md']} 0",
                    "textAlign": "right",
                    "color": delta_color,
                    "whiteSpace": "nowrap",
                },
            ),
            html.Td(
                _sparkline(closes),
                style={"padding": f"{theme.SPACE['md']} 0", "textAlign": "right", "verticalAlign": "middle"},
            ),
        ],
    )


def section() -> html.Div:
    """The watchlist surface, rendered after the holdings table.

    Self-contained: builds its own table + ticker rows on each call. Called
    from holdings._render so it shares the 30s poll cadence without needing
    its own dcc.Interval. If the watchlist grows large enough to warrant
    server-side caching of its own, split this into a callback later.
    """
    codes = _watchlist_codes()
    if not codes:
        return html.Div()

    return html.Div(
        style={"marginTop": theme.SPACE["xxl"]},
        children=[
            html.Div("Watchlist", style=_label_style()),
            html.Table(
                style={
                    "width": "100%",
                    "borderCollapse": "collapse",
                    "fontFeatureSettings": theme.TABULAR_NUMS,
                    "marginTop": theme.SPACE["md"],
                },
                children=[
                    html.Thead(
                        children=[
                            html.Tr(
                                children=[
                                    html.Th(
                                        "Ticker",
                                        style={**_label_style(), "textAlign": "left", "padding": f"0 {theme.SPACE['md']} {theme.SPACE['md']} 0", "borderBottom": theme.HAIRLINE},
                                    ),
                                    html.Th(
                                        "Last",
                                        style={**_label_style(), "textAlign": "right", "padding": f"0 {theme.SPACE['md']} {theme.SPACE['md']} 0", "borderBottom": theme.HAIRLINE},
                                    ),
                                    html.Th(
                                        "30d",
                                        style={**_label_style(), "textAlign": "right", "padding": f"0 {theme.SPACE['md']} {theme.SPACE['md']} 0", "borderBottom": theme.HAIRLINE},
                                    ),
                                    html.Th(
                                        "Trend",
                                        style={**_label_style(), "textAlign": "right", "padding": f"0 0 {theme.SPACE['md']} 0", "borderBottom": theme.HAIRLINE, "width": "100px"},
                                    ),
                                ],
                            )
                        ],
                    ),
                    html.Tbody(
                        children=[_row(code) for code in codes],
                    ),
                ],
            ),
        ],
    )

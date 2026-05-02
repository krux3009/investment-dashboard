"""Holdings view.

Implements the design brief at briefs/holdings-view.md. One screen: the
hero portfolio summary + the holdings table. Click a row to expand inline.

Architecture:
- dcc.Interval polls every 30s
- A fetch callback writes the latest PortfolioSummary into dcc.Store
- A render callback rebuilds the DOM from the store + expanded-rows store
- A toggle callback updates the expanded-rows store on row click

The table is built as semantic html.Table (NOT dash_table.DataTable) so we
have full control over hover/focus/expansion. Hover and focus-visible are
in assets/style.css; everything else is inline styles from theme tokens.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from typing import Any

import plotly.graph_objects as go
from dash import ALL, Input, Output, State, callback, clientside_callback, ctx, dcc, html, no_update

from dashboard import theme
from dashboard.data import anomalies, moomoo_client, prices
from dashboard.views import watchlist
from dashboard.data.positions import (
    PortfolioSummary,
    Position,
    arrow_for,
    format_currency_full,
    format_currency_short,
    format_pct,
    format_qty,
    format_signed_currency,
    sign_for,
    time_since,
)


# ── Public layout ───────────────────────────────────────────────────────────


def layout() -> html.Div:
    return html.Div(
        children=[
            dcc.Interval(id="holdings-poll", interval=30_000, n_intervals=0),
            dcc.Store(id="holdings-summary"),
            dcc.Store(id="holdings-expanded", data=[]),
            dcc.Store(id="watchlist-expanded", data=[]),
            # Sort state persists across reloads via localStorage.
            # Default = market value desc (= weight desc when single-currency).
            dcc.Store(
                id="holdings-sort",
                data={"column": "mkt_value", "direction": "desc"},
                storage_type="local",
            ),
            # Marker store consumed only to install the keyboard listener once.
            dcc.Store(id="holdings-keyboard-installed", data=False),
            html.Section(id="holdings-root", **{"aria-label": "Portfolio holdings"}),
        ],
    )


# ── Serialization for dcc.Store ─────────────────────────────────────────────
# dcc.Store needs JSON-serializable. Dataclasses go through asdict; datetimes
# go to ISO strings. We round-trip cleanly.


def _summary_to_json(summary: PortfolioSummary) -> dict:
    return {
        "positions": [asdict(p) for p in summary.positions],
        "total_market_value_by_ccy": dict(summary.total_market_value_by_ccy),
        "total_pnl_pct": summary.total_pnl_pct,
        "total_pnl_abs_by_ccy": dict(summary.total_pnl_abs_by_ccy),
        "last_updated": summary.last_updated.isoformat(),
        "fresh": summary.fresh,
        "simulate_with_no_positions": summary.simulate_with_no_positions,
    }


def _summary_from_json(data: dict) -> PortfolioSummary:
    return PortfolioSummary(
        positions=tuple(Position(**p) for p in data["positions"]),
        total_market_value_by_ccy=data["total_market_value_by_ccy"],
        total_pnl_pct=data["total_pnl_pct"],
        total_pnl_abs_by_ccy=data["total_pnl_abs_by_ccy"],
        last_updated=datetime.fromisoformat(data["last_updated"]),
        fresh=data["fresh"],
        simulate_with_no_positions=data.get("simulate_with_no_positions", False),
    )


# ── Callbacks ───────────────────────────────────────────────────────────────


@callback(
    Output("holdings-summary", "data"),
    Input("holdings-poll", "n_intervals"),
)
def _fetch_summary(_n: int) -> dict:
    summary = moomoo_client.get_summary()
    return _summary_to_json(summary)


@callback(
    Output("holdings-root", "children"),
    Input("holdings-summary", "data"),
    Input("holdings-expanded", "data"),
    Input("holdings-sort", "data"),
    Input("watchlist-expanded", "data"),
)
def _render(
    data: dict | None,
    expanded: list[str] | None,
    sort_state: dict | None,
    watchlist_expanded: list[str] | None,
):
    if data is None:
        return _skeleton()
    summary = _summary_from_json(data)
    expanded_set = set(expanded or [])
    watchlist_expanded_set = set(watchlist_expanded or [])
    if summary.is_empty:
        return [_empty_state(summary), watchlist.section(watchlist_expanded_set)]
    return [
        _hero(summary),
        _sort_status(sort_state),
        _table(summary, expanded_set, sort_state),
        watchlist.section(watchlist_expanded_set),
    ]


_DEFAULT_SORT = {"column": "mkt_value", "direction": "desc"}


def _is_default_sort(state: dict | None) -> bool:
    if not state:
        return True
    return (
        state.get("column") == _DEFAULT_SORT["column"]
        and state.get("direction") == _DEFAULT_SORT["direction"]
    )


@callback(
    Output("holdings-sort", "data", allow_duplicate=True),
    Input("holdings-sort-reset", "n_clicks"),
    prevent_initial_call=True,
)
def _reset_sort(n_clicks: int | None):
    if not n_clicks:
        return no_update
    return _DEFAULT_SORT


@callback(
    Output("holdings-sort", "data"),
    Input({"type": "holdings-sort-header", "column": ALL}, "n_clicks"),
    State("holdings-sort", "data"),
    prevent_initial_call=True,
)
def _toggle_sort(clicks: list[int | None], current: dict | None):
    triggered = ctx.triggered_id
    if not triggered or not isinstance(triggered, dict):
        return no_update
    if not any(clicks or []):
        return no_update
    column = triggered["column"]
    current = current or {"column": "mkt_value", "direction": "desc"}
    if current["column"] == column:
        # Same column: flip direction.
        new_direction = "asc" if current["direction"] == "desc" else "desc"
    else:
        # New column: text columns default ascending, numeric default descending.
        new_direction = "asc" if column == "ticker" else "desc"
    return {"column": column, "direction": new_direction}


@callback(
    Output("holdings-expanded", "data", allow_duplicate=True),
    Input({"type": "holdings-row", "code": ALL}, "n_clicks"),
    State("holdings-expanded", "data"),
    prevent_initial_call=True,
)
def _toggle_row(clicks: list[int | None], expanded: list[str] | None):
    triggered = ctx.triggered_id
    if not triggered or not isinstance(triggered, dict):
        return no_update
    if not any(clicks or []):
        return no_update
    code = triggered["code"]
    expanded = list(expanded or [])
    if code in expanded:
        expanded.remove(code)
    else:
        expanded.append(code)
    return expanded


# ── Keyboard handling ───────────────────────────────────────────────────────
# A single document-level listener handles all four bindings from §7 of the
# brief. ↑/↓ moves focus between rows; Enter and Space trigger click on the
# focused row; Esc clears the expanded set entirely.
#
# Esc updates the dcc.Store directly via dash_clientside.set_props to avoid
# round-tripping through n_clicks. ↑/↓ and Enter/Space stay in the DOM —
# arrow keys move focus, click events go through the existing toggle path.

clientside_callback(
    """
    function installHoldingsKeyboard() {
        if (window.__quietLedgerKeyboardInstalled) {
            return true;
        }
        window.__quietLedgerKeyboardInstalled = true;
        document.addEventListener('keydown', function (event) {
            const active = document.activeElement;
            const onRow = active && active.classList && active.classList.contains('holdings-row');
            if (event.key === 'Escape') {
                if (window.dash_clientside && window.dash_clientside.set_props) {
                    window.dash_clientside.set_props('holdings-expanded', { data: [] });
                    event.preventDefault();
                }
                return;
            }
            if (!onRow) {
                return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const rows = Array.from(document.querySelectorAll('.holdings-row'));
                const idx = rows.indexOf(active);
                if (idx === -1) {
                    return;
                }
                const next = event.key === 'ArrowDown'
                    ? Math.min(idx + 1, rows.length - 1)
                    : Math.max(idx - 1, 0);
                rows[next].focus();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                active.click();
            }
        });
        return true;
    }
    """,
    Output("holdings-keyboard-installed", "data"),
    Input("holdings-poll", "n_intervals"),
)


# ── Subcomponents ───────────────────────────────────────────────────────────


def _label_style(extra: dict | None = None) -> dict:
    style = {
        "fontSize": theme.TYPE["label"]["size"],
        "fontWeight": theme.TYPE["label"]["weight"],
        "letterSpacing": theme.TYPE["label"]["tracking"],
        "textTransform": "uppercase",
        "color": theme.QUIET_INK,
        "margin": 0,
    }
    if extra:
        style.update(extra)
    return style


def _page_header(summary: PortfolioSummary) -> html.Div:
    """Top label + last-updated marker. Stale state shown here, not in a banner."""
    if summary.fresh:
        right = html.Span(
            f"last updated {time_since(summary.last_updated)}",
            style=_label_style({"color": theme.QUIET_INK}),
        )
    else:
        right = html.Span(
            children=[
                html.Span("⚠ ", style={"marginRight": "0.25em"}),
                f"last updated {time_since(summary.last_updated)}, OpenD unreachable",
            ],
            style=_label_style({"color": theme.LOSS}),
            **{"role": "status", "aria-live": "polite"},
        )
    return html.Div(
        style={
            "display": "flex",
            "justifyContent": "space-between",
            "alignItems": "baseline",
            "marginBottom": theme.SPACE["xl"],
        },
        children=[
            html.Span("THE QUIET LEDGER", style=_label_style()),
            right,
        ],
    )


def _hero(summary: PortfolioSummary) -> html.Div:
    """Portfolio label + P&L% + total market value, plus an allocation donut.

    The hero P&L% is the single accent text per briefs/holdings-view.md §3.
    Gain/loss tints belong on per-row cells, not the aggregate hero — the
    hero's job is calm, not "you're up." Stale data renders in quiet ink.
    The donut on the right gives the book a shape, not just a number.
    """
    pnl_pct = summary.total_pnl_pct
    primary_ccy = summary.primary_currency
    total_mv = summary.total_market_value_by_ccy.get(primary_ccy, 0.0)

    if not summary.fresh or pnl_pct == 0:
        pnl_pct_color = theme.QUIET_INK
    else:
        pnl_pct_color = theme.ACCENT

    hero_text = html.Div(
        children=[
            html.Div(
                style={"display": "flex", "alignItems": "baseline", "gap": theme.SPACE["lg"]},
                children=[
                    html.Span("Portfolio", style=_label_style()),
                    html.Span(
                        children=[
                            html.Span(arrow_for(pnl_pct), style={"marginRight": "0.25em"}),
                            html.Span(format_pct(pnl_pct)),
                        ],
                        style={
                            "fontSize": theme.TYPE["display"]["size"],
                            "fontWeight": theme.TYPE["display"]["weight"],
                            "letterSpacing": theme.TYPE["display"]["tracking"],
                            "color": pnl_pct_color,
                            "lineHeight": 1,
                        },
                    ),
                    html.Span(
                        format_currency_short(total_mv, primary_ccy),
                        style={
                            "fontSize": theme.TYPE["headline"]["size"],
                            "fontWeight": 400,
                            "color": theme.QUIET_INK,
                            "lineHeight": 1,
                        },
                    ),
                ],
            ),
            _multi_currency_subtotals(summary) if summary.is_mixed_currency else None,
        ],
    )

    return html.Div(
        style={
            "borderBottom": theme.HAIRLINE,
            "paddingBottom": theme.SPACE["lg"],
            "marginBottom": theme.SPACE["xl"],
        },
        children=[
            _page_header(summary),
            html.Div(
                style={
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "space-between",
                    "gap": theme.SPACE["lg"],
                    "marginTop": theme.SPACE["lg"],
                },
                children=[hero_text, _allocation_donut(summary)],
            ),
        ],
    )


def _allocation_donut(summary: PortfolioSummary) -> html.Div | None:
    """Donut showing position weight inside the book.

    Slice values use raw market_value across currencies — technically naive
    when the book mixes USD/SGD/HKD because no FX is applied, but for a
    single-currency-dominant book (>90%) the visual is approximately right.
    Note this in DESIGN.md if FX-aware allocation becomes a real ask.

    Empty book → return None; the empty-state path doesn't call this anyway,
    but be defensive in case a future caller does.
    """
    positions = list(summary.positions)
    if not positions:
        return None

    # Sort darkest-to-lightest with the largest position taking the most
    # prominent tint. Plotly's `sort=False` preserves our explicit order.
    positions = sorted(positions, key=lambda p: -p.market_value)
    # Use the hex palette here — Plotly's color validator rejects oklch().
    tints = theme.SLICE_TINTS_HEX[: len(positions)]
    # If the book ever exceeds the tint palette, recycle the lightest tint
    # rather than wrap to the dark end (would lose the size→shade reading).
    while len(tints) < len(positions):
        tints.append(theme.SLICE_TINTS_HEX[-1])

    fig = go.Figure(
        data=[
            go.Pie(
                values=[p.market_value for p in positions],
                labels=[p.ticker for p in positions],
                hole=0.62,
                sort=False,
                direction="clockwise",
                marker=dict(
                    colors=tints,
                    line=dict(color=theme.PAPER_CREAM_HEX, width=2),
                ),
                textinfo="none",
                hovertemplate="%{label} · %{percent}<extra></extra>",
            )
        ]
    )
    fig.update_layout(
        showlegend=False,
        margin=dict(l=0, r=0, t=0, b=0),
        height=180,
        width=180,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family=theme.FONT_FAMILY, size=12, color=theme.WARM_GRAPHITE_HEX),
    )
    return html.Div(
        style={"flexShrink": 0},
        children=[
            dcc.Graph(
                figure=fig,
                config={"displayModeBar": False, "staticPlot": False},
                style={"width": "180px", "height": "180px"},
            )
        ],
    )


def _multi_currency_subtotals(summary: PortfolioSummary) -> html.Div:
    """When mixing US/HK/CN, show per-currency subtotals as a small caption."""
    chunks = []
    for ccy, mv in sorted(summary.total_market_value_by_ccy.items(), key=lambda kv: -kv[1]):
        if ccy == summary.primary_currency:
            continue
        chunks.append(f"{format_currency_short(mv, ccy)} {ccy}")
    if not chunks:
        return None
    return html.Div(
        " · ".join(chunks),
        style=_label_style({"marginTop": theme.SPACE["sm"]}),
    )


# ── Table ───────────────────────────────────────────────────────────────────

# Each column carries: visible label, alignment, width, and the sort key
# the column maps to. Numeric defaults to descending on first click; text
# (ticker) defaults to ascending. Toggling a column flips direction.
_COLS = [
    {"label": "Ticker",    "align": "left",  "width": "auto", "key": "ticker"},
    {"label": "Qty",       "align": "right", "width": "10ch", "key": "qty"},
    {"label": "Mkt Value", "align": "right", "width": "16ch", "key": "mkt_value"},
    {"label": "Today",     "align": "right", "width": "14ch", "key": "today"},
    {"label": "Total P&L", "align": "right", "width": "20ch", "key": "total"},
    {"label": "30d",       "align": "right", "width": "100px", "key": "sparkline", "sortable": False},
]

_SORT_KEYS = {
    "ticker":    lambda p: p.ticker.lower(),
    "qty":       lambda p: p.qty,
    "mkt_value": lambda p: p.market_value,
    "today":     lambda p: p.today_change_pct if p.today_change_pct is not None else 0,
    "total":     lambda p: p.total_pnl_pct,
}


def _sort_status(state: dict | None) -> html.Div:
    """Caption + reset link, visible only when sort is non-default.

    The reset button always exists in the DOM so its callback can bind cleanly;
    visibility flips via display style. When the sort matches the brief's
    weight-desc default, the chip stays out of view to keep the page label-quiet.
    """
    is_default = _is_default_sort(state)
    state = state or _DEFAULT_SORT
    col_key = state["column"]
    col_label = next((c["label"] for c in _COLS if c["key"] == col_key), col_key)
    direction_word = "descending" if state["direction"] == "desc" else "ascending"
    caption = f"sorted by {col_label.lower()}, {direction_word}"

    return html.Div(
        style={
            "display": "none" if is_default else "flex",
            "justifyContent": "flex-end",
            "alignItems": "baseline",
            "gap": theme.SPACE["sm"],
            "marginBottom": theme.SPACE["sm"],
        },
        children=[
            html.Span(caption, style=_label_style({"color": theme.QUIET_INK})),
            html.Button(
                "Reset",
                id="holdings-sort-reset",
                n_clicks=0,
                className="holdings-sort-reset",
                style={
                    **_label_style({"color": theme.ACCENT}),
                    "background": "none",
                    "border": "none",
                    "padding": 0,
                    "cursor": "pointer",
                },
                **{"aria-label": "Reset sort to portfolio weight, descending"},
            ),
        ],
    )


def _sort_header(col: dict, state: dict) -> html.Th:
    """Column header. Click to resort. Indicator arrow on the active column.

    Columns with `sortable: False` (e.g. the sparkline column) render as a
    static label without the click affordance — clicking would have to fall
    back to a default sort and the user-trip would be confusing.
    """
    sortable = col.get("sortable", True)
    if not sortable:
        return html.Th(
            children=col["label"],
            style={
                **_label_style(),
                "color": theme.QUIET_INK,
                "textAlign": col["align"],
                "width": col["width"],
                "padding": f"0 {theme.SPACE['md']} {theme.SPACE['md']} 0",
                "borderBottom": theme.HAIRLINE,
            },
        )

    is_active = state["column"] == col["key"]
    indicator = ""
    if is_active:
        indicator = " ↓" if state["direction"] == "desc" else " ↑"

    label_color = theme.WARM_GRAPHITE if is_active else theme.QUIET_INK

    return html.Th(
        id={"type": "holdings-sort-header", "column": col["key"]},
        n_clicks=0,
        className="holdings-sort-header" + (" holdings-sort-header--active" if is_active else ""),
        children=[col["label"], html.Span(indicator, style={"color": theme.ACCENT})],
        style={
            **_label_style(),
            "color": label_color,
            "textAlign": col["align"],
            "width": col["width"],
            "padding": f"0 {theme.SPACE['md']} {theme.SPACE['md']} 0",
            "borderBottom": theme.HAIRLINE,
            "cursor": "pointer",
            "userSelect": "none",
        },
        **{
            "role": "button",
            "aria-sort": (
                "descending" if is_active and state["direction"] == "desc"
                else "ascending" if is_active
                else "none"
            ),
        },
    )


def _drillin_chart(code: str, days: int = 90) -> Any:
    """N-day close-price line chart for the holdings drill-in.

    Single warm-graphite line, no fill, right-side y-axis (trading-platform
    convention). Hover shows date + close price. Returns None when the
    cache + fetch produce no data — the drill-in stays clean for tickers
    without history (e.g. SG.K71U with no SGX subscription).
    """
    df = prices.get_history(code, days=days)
    if df.empty:
        return None

    fig = go.Figure(
        go.Scatter(
            x=df["date"],
            y=df["close"],
            mode="lines",
            line=dict(color=theme.WARM_GRAPHITE_HEX, width=1.5),
            hovertemplate="%{x|%b %-d, %Y}<br>$%{y:.2f}<extra></extra>",
        )
    )
    fig.update_layout(
        showlegend=False,
        margin=dict(l=0, r=0, t=8, b=24),
        height=200,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family=theme.FONT_FAMILY, color=theme.QUIET_INK_HEX, size=10),
        xaxis=dict(
            showgrid=False,
            showline=False,
            ticks="",
            tickfont=dict(color=theme.QUIET_INK_HEX, size=10),
        ),
        yaxis=dict(
            showgrid=True,
            gridcolor=theme.BORDER_HEX,
            gridwidth=0.5,
            zeroline=False,
            ticks="",
            side="right",
            tickfont=dict(color=theme.QUIET_INK_HEX, size=10),
        ),
        hoverlabel=dict(
            bgcolor=theme.PAPER_CREAM_HEX,
            bordercolor=theme.BORDER_HEX,
            font=dict(family=theme.FONT_FAMILY, color=theme.WARM_GRAPHITE_HEX, size=11),
        ),
    )
    return dcc.Graph(
        figure=fig,
        config={"displayModeBar": False},
        style={"marginTop": theme.SPACE["md"]},
    )


def _sparkline(code: str, width: int = 90, height: int = 22) -> Any:
    """30-day close-price sparkline. Cached prices, single-line chart, no axes.

    Color tracks overall trajectory: GAIN if last > first, LOSS if last <
    first, QUIET_INK when flat or unavailable. Returns an em-dash placeholder
    when prices.get_close_series returns nothing (offline / first-fetch fail).
    """
    closes = prices.get_close_series(code, days=30)
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


def _apply_sort(positions: tuple, sort_state: dict | None) -> list:
    """Sort positions per the current sort state. None falls back to mkt_value desc."""
    state = sort_state or {"column": "mkt_value", "direction": "desc"}
    key_fn = _SORT_KEYS.get(state["column"], _SORT_KEYS["mkt_value"])
    reverse = state["direction"] == "desc"
    return sorted(positions, key=key_fn, reverse=reverse)


def _table(summary: PortfolioSummary, expanded: set[str], sort_state: dict | None) -> html.Table:
    state = sort_state or {"column": "mkt_value", "direction": "desc"}
    return html.Table(
        style={
            "width": "100%",
            "borderCollapse": "collapse",
            "fontFeatureSettings": theme.TABULAR_NUMS,
        },
        children=[
            html.Thead(
                html.Tr(
                    [_sort_header(col, state) for col in _COLS],
                )
            ),
            html.Tbody(
                [tr for p in _apply_sort(summary.positions, state)
                    for tr in _row_pair(p, expanded, summary)],
            ),
        ],
    )


def _row_pair(p: Position, expanded: set[str], summary: PortfolioSummary):
    """Returns the glance row plus an optional expansion row underneath."""
    is_expanded = p.code in expanded
    rows = [_glance_row(p, is_expanded, summary)]
    if is_expanded:
        rows.append(_expansion_row(p, summary))
    return rows


def _glance_row(p: Position, is_expanded: bool, summary: PortfolioSummary) -> html.Tr:
    today_color = (
        theme.GAIN if (p.today_change_pct or 0) > 0 else
        theme.LOSS if (p.today_change_pct or 0) < 0 else theme.QUIET_INK
    )
    total_color = (
        theme.GAIN if p.total_pnl_pct > 0 else
        theme.LOSS if p.total_pnl_pct < 0 else theme.QUIET_INK
    )
    if not summary.fresh:
        today_color = theme.QUIET_INK
        total_color = theme.QUIET_INK

    ticker_color = theme.ACCENT if is_expanded and summary.fresh else theme.WARM_GRAPHITE
    ticker_weight = 500 if is_expanded else 400

    market_badge = None
    if summary.is_mixed_currency:
        market_badge = html.Span(
            p.market,
            style={
                "fontSize": "0.7rem",
                "letterSpacing": "0.06em",
                "color": theme.QUIET_INK,
                "marginLeft": theme.SPACE["sm"],
            },
        )

    return html.Tr(
        id={"type": "holdings-row", "code": p.code},
        n_clicks=0,
        title=p.name,  # company name on hover
        className="holdings-row" + (" holdings-row--expanded" if is_expanded else ""),
        tabIndex=0,
        **{
            "role": "button",
            "aria-expanded": "true" if is_expanded else "false",
            "aria-label": f"{p.ticker}, {p.name}, {format_qty(p.qty)} shares, {format_pct(p.total_pnl_pct)} total",
        },
        children=[
            html.Td(
                html.Span(p.ticker, style={"color": ticker_color, "fontWeight": ticker_weight}),
                style={"padding": f"{theme.SPACE['md']} {theme.SPACE['md']} {theme.SPACE['md']} 0", "textAlign": "left"},
            ),
            html.Td(
                format_qty(p.qty),
                style={"padding": f"{theme.SPACE['md']} {theme.SPACE['md']} {theme.SPACE['md']} 0", "textAlign": "right"},
            ),
            html.Td(
                children=[format_currency_full(p.market_value, p.currency, decimals=0), market_badge],
                style={"padding": f"{theme.SPACE['md']} {theme.SPACE['md']} {theme.SPACE['md']} 0", "textAlign": "right", "whiteSpace": "nowrap"},
            ),
            html.Td(
                children=[
                    html.Span(arrow_for(p.today_change_pct), style={"marginRight": "0.3em"}),
                    html.Span(format_pct(p.today_change_pct)),
                ],
                style={
                    "padding": f"{theme.SPACE['md']} {theme.SPACE['md']} {theme.SPACE['md']} 0",
                    "textAlign": "right",
                    "color": today_color,
                    "whiteSpace": "nowrap",
                },
            ),
            html.Td(
                children=[
                    html.Span(arrow_for(p.total_pnl_pct), style={"marginRight": "0.3em"}),
                    html.Span(format_pct(p.total_pnl_pct)),
                    html.Span(
                        f"  {format_signed_currency(p.total_pnl_abs, p.currency)}",
                        style={"marginLeft": theme.SPACE["sm"], "color": theme.QUIET_INK, "fontSize": "0.85em"},
                    ),
                ],
                style={
                    "padding": f"{theme.SPACE['md']} {theme.SPACE['md']} {theme.SPACE['md']} 0",
                    "textAlign": "right",
                    "color": total_color,
                    "whiteSpace": "nowrap",
                },
            ),
            html.Td(
                _sparkline(p.code) if summary.fresh else html.Span("–", style={"color": theme.QUIET_INK}),
                style={
                    "padding": f"{theme.SPACE['md']} 0",
                    "textAlign": "right",
                    "verticalAlign": "middle",
                },
            ),
        ],
    )


def _expansion_row(p: Position, summary: PortfolioSummary) -> html.Tr:
    """Inline drill-in: cost basis · weight · today $ delta · anomaly note slot."""
    primary_ccy = summary.primary_currency
    total_mv = summary.total_market_value_by_ccy.get(primary_ccy, 0.0)
    weight_pct = (p.market_value / total_mv) if total_mv > 0 and p.currency == primary_ccy else None
    # If position is in a non-primary currency, weight isn't meaningful without FX.

    fields: list = [
        ("Cost basis", format_currency_full(p.cost_basis, p.currency)),
        (
            "Today",
            format_signed_currency(p.today_change_abs or 0, p.currency)
            if p.today_change_abs is not None else "–",
        ),
    ]
    if weight_pct is not None:
        fields.append(("Weight", f"{weight_pct * 100:.1f}%"))
    fields.append(("Current price", format_currency_full(p.current_price, p.currency)))

    # Phase 5: pull anomaly notes from moomoo skills (technical / capital /
    # derivatives). Cached per session, so reopening a row is free. Empty
    # categories are silently skipped — absence stays the signal.
    anomaly_blocks = []
    for anom in anomalies.fetch_all(p.code):
        if not anom.has_content:
            continue
        anomaly_blocks.append(
            html.Div(
                style={"marginTop": theme.SPACE["md"]},
                children=[
                    html.Div(anom.label.upper(), style=_label_style()),
                    html.Div(
                        anom.content,
                        style={
                            "color": theme.WARM_GRAPHITE,
                            "fontSize": "0.85rem",
                            "marginTop": theme.SPACE["xs"],
                            "whiteSpace": "pre-line",  # honor newlines from the prose
                            "maxWidth": theme.PROSE_MAX_CH,
                        },
                    ),
                ],
            )
        )

    drillin_content: list = [
        html.Div(
            " · ".join(f"{label} {value}" for label, value in fields),
            style={"marginTop": theme.SPACE["xs"]},
        ),
    ]
    chart = _drillin_chart(p.code) if summary.fresh else None
    if chart is not None:
        drillin_content.append(chart)
    drillin_content.extend(anomaly_blocks)

    return html.Tr(
        className="holdings-expansion",
        children=[
            html.Td(
                colSpan=len(_COLS),
                style={
                    "padding": f"0 {theme.SPACE['lg']} {theme.SPACE['md']} {theme.SPACE['lg']}",
                    "borderBottom": theme.HAIRLINE,
                    "color": theme.QUIET_INK,
                    "fontSize": "0.9rem",
                },
                children=drillin_content,
            )
        ],
    )


def _empty_state(summary: PortfolioSummary):
    children = [
        _page_header(summary),
        html.Div(
            style={
                "display": "flex",
                "alignItems": "baseline",
                "gap": theme.SPACE["lg"],
                "marginTop": theme.SPACE["lg"],
            },
            children=[
                html.Span("Portfolio", style=_label_style()),
                html.Span(
                    "No open positions.",
                    style={
                        "fontSize": theme.TYPE["headline"]["size"],
                        "fontWeight": 400,
                        "color": theme.QUIET_INK,
                    },
                ),
            ],
        ),
        html.P(
            "Once you hold something on moomoo, it appears here.",
            style={
                "color": theme.QUIET_INK,
                "marginTop": theme.SPACE["md"],
                "maxWidth": theme.PROSE_MAX_CH,
            },
        ),
    ]
    if summary.simulate_with_no_positions:
        children.append(
            html.P(
                "Querying SIMULATE. Set MOOMOO_TRD_ENV=REAL in .env to see the live book.",
                style={
                    "color": theme.QUIET_INK,
                    "marginTop": theme.SPACE["sm"],
                    "fontSize": "0.875rem",
                    "maxWidth": theme.PROSE_MAX_CH,
                },
            )
        )
    return html.Div(
        style={"borderBottom": theme.HAIRLINE, "paddingBottom": theme.SPACE["xl"]},
        children=children,
    )


def _skeleton() -> html.Div:
    """Initial loading state: skeleton rows, no spinner."""
    skeleton_row = html.Div(
        style={
            "height": "1.5rem",
            "background": theme.BORDER,
            "borderRadius": "2px",
            "marginBottom": theme.SPACE["sm"],
            "opacity": 0.5,
        }
    )
    return html.Div(
        children=[
            html.Div(
                style={
                    "display": "flex",
                    "justifyContent": "space-between",
                    "alignItems": "baseline",
                    "marginBottom": theme.SPACE["xl"],
                },
                children=[
                    html.Span("THE QUIET LEDGER", style=_label_style()),
                ],
            ),
            html.Div(
                style={"display": "flex", "alignItems": "baseline", "gap": theme.SPACE["lg"]},
                children=[
                    html.Span("Portfolio", style=_label_style()),
                    html.Span(
                        "–",
                        style={
                            "fontSize": theme.TYPE["display"]["size"],
                            "fontWeight": theme.TYPE["display"]["weight"],
                            "color": theme.QUIET_INK,
                        },
                    ),
                ],
            ),
            html.Div(
                style={"marginTop": theme.SPACE["xl"], "borderTop": theme.HAIRLINE, "paddingTop": theme.SPACE["lg"]},
                children=[skeleton_row, skeleton_row, skeleton_row],
            ),
        ]
    )

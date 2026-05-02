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

from dash import ALL, Input, Output, State, callback, ctx, dcc, html, no_update

from dashboard import theme
from dashboard.data import moomoo_client
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
    }


def _summary_from_json(data: dict) -> PortfolioSummary:
    return PortfolioSummary(
        positions=tuple(Position(**p) for p in data["positions"]),
        total_market_value_by_ccy=data["total_market_value_by_ccy"],
        total_pnl_pct=data["total_pnl_pct"],
        total_pnl_abs_by_ccy=data["total_pnl_abs_by_ccy"],
        last_updated=datetime.fromisoformat(data["last_updated"]),
        fresh=data["fresh"],
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
)
def _render(data: dict | None, expanded: list[str] | None):
    if data is None:
        return _skeleton()
    summary = _summary_from_json(data)
    expanded_set = set(expanded or [])
    if summary.is_empty:
        return _empty_state(summary)
    return [_hero(summary), _table(summary, expanded_set)]


@callback(
    Output("holdings-expanded", "data"),
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
    """Portfolio label + P&L% + total market value. The single accent point."""
    pnl_pct = summary.total_pnl_pct
    primary_ccy = summary.primary_currency
    total_mv = summary.total_market_value_by_ccy.get(primary_ccy, 0.0)

    # The hero P&L% is the single accent point per briefs/holdings-view.md §3.
    # Gain/loss color tints belong on per-row cells, not the aggregate hero —
    # the hero's job is calm, not "you're up." Stale data renders in quiet ink.
    if not summary.fresh:
        pnl_pct_color = theme.QUIET_INK
    elif pnl_pct == 0:
        pnl_pct_color = theme.QUIET_INK
    else:
        pnl_pct_color = theme.ACCENT

    return html.Div(
        style={
            "borderBottom": theme.HAIRLINE,
            "paddingBottom": theme.SPACE["lg"],
            "marginBottom": theme.SPACE["xl"],
        },
        children=[
            _page_header(summary),
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

# Column widths and alignment. Numeric cols right-aligned, text left.
_COLS = [
    ("Ticker",     "left",   "auto"),
    ("Qty",        "right",  "10ch"),
    ("Mkt Value",  "right",  "16ch"),
    ("Today",      "right",  "14ch"),
    ("Total P&L",  "right",  "20ch"),
]


def _table(summary: PortfolioSummary, expanded: set[str]) -> html.Table:
    return html.Table(
        style={
            "width": "100%",
            "borderCollapse": "collapse",
            "fontFeatureSettings": theme.TABULAR_NUMS,
        },
        children=[
            html.Thead(
                html.Tr(
                    [
                        html.Th(
                            label,
                            style={
                                **_label_style(),
                                "textAlign": align,
                                "width": width,
                                "padding": f"0 {theme.SPACE['md']} {theme.SPACE['sm']} 0",
                                "borderBottom": theme.HAIRLINE,
                            },
                        )
                        for label, align, width in _COLS
                    ],
                )
            ),
            html.Tbody(
                [tr for p in summary.positions for tr in _row_pair(p, expanded, summary)],
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
        children=[
            html.Td(
                html.Span(p.ticker, style={"color": ticker_color, "fontWeight": ticker_weight}),
                style={"padding": f"{theme.SPACE['sm']} {theme.SPACE['md']} {theme.SPACE['sm']} 0", "textAlign": "left"},
            ),
            html.Td(
                format_qty(p.qty),
                style={"padding": f"{theme.SPACE['sm']} {theme.SPACE['md']} {theme.SPACE['sm']} 0", "textAlign": "right"},
            ),
            html.Td(
                children=[format_currency_full(p.market_value, p.currency, decimals=0), market_badge],
                style={"padding": f"{theme.SPACE['sm']} {theme.SPACE['md']} {theme.SPACE['sm']} 0", "textAlign": "right", "whiteSpace": "nowrap"},
            ),
            html.Td(
                children=[
                    html.Span(arrow_for(p.today_change_pct), style={"marginRight": "0.3em"}),
                    html.Span(format_pct(p.today_change_pct)),
                ],
                style={
                    "padding": f"{theme.SPACE['sm']} {theme.SPACE['md']} {theme.SPACE['sm']} 0",
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
                    "padding": f"{theme.SPACE['sm']} 0",
                    "textAlign": "right",
                    "color": total_color,
                    "whiteSpace": "nowrap",
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

    return html.Tr(
        className="holdings-expansion",
        children=[
            html.Td(
                colSpan=len(_COLS),
                style={
                    "padding": f"0 0 {theme.SPACE['md']} {theme.SPACE['lg']}",
                    "borderBottom": theme.HAIRLINE,
                    "color": theme.QUIET_INK,
                    "fontSize": "0.9rem",
                },
                children=[
                    html.Div(
                        " · ".join(f"{label} {value}" for label, value in fields),
                        style={"marginTop": theme.SPACE["xs"]},
                    ),
                    # Anomaly slot. v2 wires moomoo-anomaly skills here.
                    html.Div(
                        f"{p.ticker} · anomaly checks not wired in v1",
                        style={
                            "marginTop": theme.SPACE["xs"],
                            "color": theme.QUIET_INK,
                            "fontStyle": "italic",
                            "fontSize": "0.8rem",
                        },
                    ),
                ],
            )
        ],
    )


def _empty_state(summary: PortfolioSummary):
    return html.Div(
        style={"borderBottom": theme.HAIRLINE, "paddingBottom": theme.SPACE["xl"]},
        children=[
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
        ],
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

"""Dash app shell. Wires the holdings view in as the primary surface."""

import os

import dash
from dash import html

from dashboard import theme
from dashboard.views import holdings

app = dash.Dash(
    __name__,
    title="The Quiet Ledger",
    external_stylesheets=[theme.GOOGLE_FONTS_URL],
)

PAGE_STYLE = {
    "backgroundColor": theme.PAPER_CREAM,
    "color": theme.WARM_GRAPHITE,
    "fontFamily": theme.FONT_FAMILY,
    "fontSize": theme.TYPE["body"]["size"],
    "fontWeight": theme.TYPE["body"]["weight"],
    "minHeight": "100vh",
    "padding": f"{theme.SPACE['xl']} {theme.SPACE['lg']}",
    "fontFeatureSettings": theme.TABULAR_NUMS,
}

# Centered content column. Wide enough for the table at glance density,
# narrow enough not to feel like an admin panel. ~64rem ≈ 1024px.
CONTENT_STYLE = {
    "maxWidth": "64rem",
    "margin": "0 auto",
}


app.layout = html.Main(
    style=PAGE_STYLE,
    children=[
        html.Div(style=CONTENT_STYLE, children=[holdings.layout()]),
    ],
)


def main() -> None:
    """Entry point used by `dashboard` script and `python -m dashboard`."""
    from dotenv import load_dotenv

    load_dotenv()
    app.run(
        host=os.environ.get("DASH_HOST", "127.0.0.1"),
        port=int(os.environ.get("DASH_PORT", "8050")),
        debug=os.environ.get("DASH_DEBUG", "true").lower() == "true",
    )


if __name__ == "__main__":
    main()

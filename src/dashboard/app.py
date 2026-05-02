"""Dash app shell. Hello-world layout that proves the design tokens render.

Real views go in `dashboard.views.*` and are added to `LAYOUT` once shaped.
"""

import os

import dash
from dash import html

from dashboard import theme

app = dash.Dash(
    __name__,
    title="The Quiet Ledger",
    external_stylesheets=[theme.GOOGLE_FONTS_URL],
)

# Body-level base styles. Dash injects `#react-entry-point` into <body>;
# we set the page chrome via inline CSS on the outermost container.
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

HEADLINE_STYLE = {
    "fontSize": theme.TYPE["headline"]["size"],
    "fontWeight": theme.TYPE["headline"]["weight"],
    "margin": f"0 0 {theme.SPACE['md']} 0",
}

LABEL_STYLE = {
    "fontSize": theme.TYPE["label"]["size"],
    "fontWeight": theme.TYPE["label"]["weight"],
    "letterSpacing": theme.TYPE["label"]["tracking"],
    "textTransform": "uppercase",
    "color": theme.QUIET_INK,
    "margin": f"0 0 {theme.SPACE['xs']} 0",
}


app.layout = html.Div(
    style=PAGE_STYLE,
    children=[
        html.Div(
            style={"borderBottom": theme.HAIRLINE, "paddingBottom": theme.SPACE["lg"]},
            children=[
                html.P("The Quiet Ledger", style=LABEL_STYLE),
                html.H1("Hello.", style=HEADLINE_STYLE),
                html.P(
                    "Scaffold up. Theme tokens applied. Holdings view next.",
                    style={"color": theme.QUIET_INK, "maxWidth": theme.PROSE_MAX_CH},
                ),
            ],
        ),
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

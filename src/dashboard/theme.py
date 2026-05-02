"""Design tokens for the Quiet Ledger.

Single source of truth for colors, type, spacing. Mirrors DESIGN.md.
Re-run /impeccable document later to regenerate from real code.
"""

# ── Color tokens ────────────────────────────────────────────────────────────
# OKLCH per DESIGN.md; CSS supports oklch() natively.

PAPER_CREAM = "oklch(96% 0.005 75)"        # surface
WARM_GRAPHITE = "oklch(20% 0.008 60)"      # body + headings ink
BORDER = "oklch(86% 0.006 70)"             # hairlines
QUIET_INK = "oklch(45% 0.008 60)"          # secondary text, axis labels

# Accent: see DESIGN.md "[Accent — to be resolved during implementation]".
# This is the example direction (muted rust). Revisit during the first
# /impeccable shape pass on the holdings view, then commit a final hue.
ACCENT = "oklch(55% 0.12 28)"

# Status reinforcement (paired with arrows/sign per "The No-Green-On-Red Rule").
# Not used as the sole signal of anything. These are tinted away from pure
# red/green to stay coherent with the warm palette.
GAIN = "oklch(48% 0.10 145)"               # muted forest, used with ↑ / +
LOSS = "oklch(48% 0.13 25)"                # muted sienna, used with ↓ / −

COLORS = {
    "paper_cream": PAPER_CREAM,
    "warm_graphite": WARM_GRAPHITE,
    "border": BORDER,
    "quiet_ink": QUIET_INK,
    "accent": ACCENT,
    "gain": GAIN,
    "loss": LOSS,
}

# ── Typography tokens ───────────────────────────────────────────────────────
# DESIGN.md direction: warm humanist sans, NOT Inter/Geist/SF Pro/Helvetica.
# Default below = IBM Plex Sans (free, Google Fonts, has matching Plex Mono).
# Swap the family below if a different humanist sans wins after first render.

FONT_FAMILY = '"IBM Plex Sans", system-ui, sans-serif'
FONT_FAMILY_MONO = '"IBM Plex Mono", ui-monospace, monospace'
GOOGLE_FONTS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=IBM+Plex+Sans:wght@300;400;500;600"
    "&family=IBM+Plex+Mono:wght@400;500"
    "&display=swap"
)

# Tabular figures via OpenType feature. Applied globally to numeric cells.
TABULAR_NUMS = '"tnum" 1'

# Type ramp — relative steps; tune in implementation.
TYPE = {
    "display":  {"size": "clamp(2rem, 5vw, 3rem)", "weight": 300, "tracking": "-0.01em"},
    "headline": {"size": "1.5rem",     "weight": 500, "tracking": "normal"},
    "title":    {"size": "1.125rem",   "weight": 500, "tracking": "normal"},
    "body":     {"size": "0.9375rem",  "weight": 400, "tracking": "normal"},
    "label":    {"size": "0.75rem",    "weight": 500, "tracking": "0.06em", "case": "uppercase"},
}

# ── Spacing tokens ──────────────────────────────────────────────────────────
# Vary spacing for rhythm; same padding everywhere is monotony.

SPACE = {
    "xs":  "4px",
    "sm":  "8px",
    "md":  "16px",
    "lg":  "24px",
    "xl":  "40px",
    "xxl": "64px",
}

# ── Layout tokens ───────────────────────────────────────────────────────────

PROSE_MAX_CH = "70ch"      # body line length cap
HAIRLINE = f"1px solid {BORDER}"

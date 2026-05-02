"""Position dataclass + formatting helpers.

The dataclass is the canonical shape the holdings view consumes. The moomoo
SDK's DataFrame columns are translated into this in moomoo_client. Helpers
encode the formatting rules from briefs/holdings-view.md (signed numbers,
arrows, K/M abbreviation, no em dashes).
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal


Market = Literal["US", "HK", "CN", "JP", "SG", "AU", "MY", "CA", "?"]
Currency = Literal["USD", "HKD", "CNH", "JPY", "SGD", "AUD", "MYR", "CAD", "?"]


@dataclass(frozen=True)
class Position:
    """One row in the holdings table."""

    code: str                # "US.PLTR" — moomoo's full code
    ticker: str              # "PLTR" — display ticker
    name: str                # "Palantir Technologies Inc"
    market: Market
    currency: Currency

    qty: float               # shares held
    cost_basis: float        # avg cost per share, in `currency`
    current_price: float     # current price per share
    market_value: float      # qty * current_price (in `currency`)

    today_change_pct: float | None   # signed, e.g. +0.024 = +2.4%; None if unavailable
    today_change_abs: float | None   # signed, in `currency`

    total_pnl_pct: float     # signed, e.g. +0.183 = +18.3%
    total_pnl_abs: float     # signed, in `currency`


@dataclass(frozen=True)
class PortfolioSummary:
    """Top-level state passed to the holdings view."""

    positions: tuple[Position, ...]
    total_market_value_by_ccy: dict[Currency, float] = field(default_factory=dict)
    total_pnl_pct: float = 0.0       # weighted-avg P&L% across the book
    total_pnl_abs_by_ccy: dict[Currency, float] = field(default_factory=dict)
    last_updated: datetime = field(default_factory=datetime.now)
    fresh: bool = True               # False = stale data, OpenD unreachable

    @property
    def is_empty(self) -> bool:
        return len(self.positions) == 0

    @property
    def is_mixed_currency(self) -> bool:
        return len(self.total_market_value_by_ccy) > 1

    @property
    def currencies(self) -> tuple[Currency, ...]:
        return tuple(sorted(self.total_market_value_by_ccy.keys()))

    @property
    def primary_currency(self) -> Currency:
        """The currency carrying the most market value, used for the hero number."""
        if not self.total_market_value_by_ccy:
            return "USD"
        return max(self.total_market_value_by_ccy.items(), key=lambda kv: kv[1])[0]


# ── Formatting helpers ──────────────────────────────────────────────────────
# Rules from briefs/holdings-view.md §8 Content Requirements.

_CURRENCY_SYMBOLS: dict[Currency, str] = {
    "USD": "$", "HKD": "HK$", "CNH": "¥", "JPY": "¥",
    "SGD": "S$", "AUD": "A$", "MYR": "RM", "CAD": "C$", "?": "",
}


def arrow_for(value: float | None) -> str:
    """Up arrow / down arrow / horizontal dash for none-or-zero. No em dashes."""
    if value is None or value == 0:
        return "–"  # en dash
    return "↑" if value > 0 else "↓"


def sign_for(value: float | None) -> str:
    """Explicit + / − sign. Uses Unicode minus (U+2212), not hyphen."""
    if value is None or value == 0:
        return ""
    return "+" if value > 0 else "−"


def format_pct(value: float | None, decimals: int = 1) -> str:
    """Signed percent: '+2.4%', '−18.3%'. Returns '–' if None.

    Input is a ratio (0.024 → +2.4%). Use raw_pct=True if input is already in
    percent units (e.g. moomoo's pl_ratio sometimes is, depending on field).
    """
    if value is None:
        return "–"
    if value == 0:
        return "0.0%"
    sign = "+" if value > 0 else "−"
    return f"{sign}{abs(value) * 100:.{decimals}f}%"


def format_currency_short(value: float, currency: Currency = "USD") -> str:
    """Compact currency: $124.5K, HK$1.2M. For hero numbers and dense cells."""
    sym = _CURRENCY_SYMBOLS.get(currency, "")
    abs_v = abs(value)
    if abs_v >= 1_000_000:
        return f"{sym}{value / 1_000_000:.1f}M"
    if abs_v >= 1_000:
        return f"{sym}{value / 1_000:.1f}K"
    return f"{sym}{value:.0f}"


def format_currency_full(value: float, currency: Currency = "USD", decimals: int = 2) -> str:
    """Full currency with thousands sep: $6,025.45. For drill-in detail."""
    sym = _CURRENCY_SYMBOLS.get(currency, "")
    if value < 0:
        return f"−{sym}{abs(value):,.{decimals}f}"
    return f"{sym}{value:,.{decimals}f}"


def format_signed_currency(value: float, currency: Currency = "USD") -> str:
    """Signed compact currency: +$932, −$103."""
    if value == 0:
        return f"{_CURRENCY_SYMBOLS.get(currency, '')}0"
    sign = "+" if value > 0 else "−"
    sym = _CURRENCY_SYMBOLS.get(currency, "")
    return f"{sign}{sym}{abs(value):,.0f}"


def format_qty(value: float) -> str:
    """Shares: '250' or '14.5' (fractional shares allowed by some brokers)."""
    if value == int(value):
        return f"{int(value):,}"
    return f"{value:,.4f}".rstrip("0").rstrip(".")


def time_since(dt: datetime, now: datetime | None = None) -> str:
    """Human-readable elapsed time: '3 sec ago', '14 min ago', '2 hr ago'."""
    now = now or datetime.now()
    delta = now - dt
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return f"{seconds} sec ago"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} min ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hr ago"
    days = hours // 24
    return f"{days} day ago"

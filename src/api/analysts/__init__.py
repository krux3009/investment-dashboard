"""Per-ticker analyst tiles — Fundamentals · News · Sentiment · Technical.

Each analyst module owns one tile per holding: a single observation-only
sentence ≤22 words. The orchestrator (`api.digest`) fans out 4 calls per
ticker via `asyncio.gather`, semaphore-bounded.

Borrows the role-decomposition pattern from TauricResearch/TradingAgents
(prompt structure only — no LangGraph, no debate, no Trader synthesis,
no action language).
"""

from api.analysts import fundamentals, news, sentiment, technical  # noqa: F401
from api.analysts._base import AnalystOutput, FORBIDDEN_BASE  # noqa: F401

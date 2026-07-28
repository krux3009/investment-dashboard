"""Smoke checks for the refactored seams: db/cache KV, advisor engine.

Run with the API server stopped or running — the test redirects the DB
path to a temp file before the first connection, so it never touches
(or locks against) data/prices.duckdb.

    uv run python tests/test_seams.py
"""

from __future__ import annotations

import sys
import tempfile
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

# Redirect the shared DuckDB file BEFORE anything connects.
from api.data import db  # noqa: E402

db._DB_PATH = Path(tempfile.mkdtemp()) / "test.duckdb"

from api.data import cache  # noqa: E402
from api import advisor  # noqa: E402
from api._advisor_guard import FORBIDDEN_HYPE, has_forbidden  # noqa: E402


def test_cache_roundtrip() -> None:
    assert cache.get("kv_test", "k") is None
    cache.put("kv_test", "k", {"a": 1, "zh": "中文"})
    row = cache.get("kv_test", "k", ttl=timedelta(hours=1))
    assert row is not None and row[0] == {"a": 1, "zh": "中文"}
    # Expired TTL → miss
    assert cache.get("kv_test", "k", ttl=timedelta(seconds=-1)) is None
    cache.clear("kv_test", "k")
    assert cache.get("kv_test", "k") is None


def test_guard() -> None:
    assert has_forbidden("This is guaranteed to moon", FORBIDDEN_HYPE["en"], "en") == "guaranteed"
    assert has_forbidden("A calm, grounded view.", FORBIDDEN_HYPE["en"], "en") is None
    assert has_forbidden("这只股票必涨", FORBIDDEN_HYPE["zh"], "zh") == "必涨"


def test_parse_wmw() -> None:
    body = "What: a thing.\nMeaning: context.\nWatch: next window."
    assert advisor.parse_wmw(body) == ("a thing.", "context.", "next window.")
    # Unparseable body lands whole in What
    assert advisor.parse_wmw("free prose")[0] == "free prose"


class _FakeBlock:
    type = "text"

    def __init__(self, text: str) -> None:
        self.text = text


class _FakeClient:
    """Exercises the injection seam: complete(client=...) never imports the SDK."""

    def __init__(self, replies: list[str]) -> None:
        self._replies = list(replies)
        self.calls = 0

    @property
    def messages(self):
        return self

    def create(self, **kwargs):
        self.calls += 1
        reply = self._replies.pop(0)

        class _Resp:
            content = [_FakeBlock(reply)]

        return _Resp()


_SPEC = advisor.AdvisorSpec(
    surface="test-surface",
    prompt="Test prompt.",
    prompt_version="v0",
    ttl=timedelta(hours=1),
)


def test_complete_clean() -> None:
    client = _FakeClient(["What: fine.\nMeaning: fine.\nWatch: fine."])
    body = advisor.complete(_SPEC, "context", "en", client=client)
    assert body is not None and body.startswith("What:")
    assert client.calls == 1


def test_complete_retry_then_quiet() -> None:
    client = _FakeClient(["This is guaranteed.", "Still guaranteed."])
    assert advisor.complete(_SPEC, "context", "en", client=client) is None
    assert client.calls == 2  # one retry, then the caller's quiet fallback


def test_complete_retry_recovers() -> None:
    client = _FakeClient(["guaranteed win", "A calm view."])
    assert advisor.complete(_SPEC, "context", "en", client=client) == "A calm view."


def test_advisor_cache_keys_split_locale() -> None:
    advisor.save(_SPEC, "k", {"x": 1}, "en")
    assert advisor.load(_SPEC, "k", "en") is not None
    assert advisor.load(_SPEC, "k", "zh") is None  # locale splits the key


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all seam checks passed")

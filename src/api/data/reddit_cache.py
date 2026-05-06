"""DuckDB-cached Reddit mentions per ticker.

Mirrors `data/prices.py`'s single-writer pattern: every write goes through
`prices._DB_LOCK`, every connection is `prices._db()`. The cache table
shares the prices.duckdb file. Single moomoo / digest / reddit writer
guarantee from CLAUDE.md still holds.

The cache key is `(code, post_id)` so the same Reddit post about NVDA
crossing two subreddits gets stored once per code.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from api.data import prices

Classification = Literal["positive", "neutral", "negative"]


@dataclass(frozen=True)
class Mention:
    code: str
    subreddit: str
    post_id: str
    title: str
    body: str
    url: str
    score: int
    num_comments: int
    classification: Classification
    created_at: datetime
    fetched_at: datetime


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS reddit_mentions (
                code VARCHAR NOT NULL,
                post_id VARCHAR NOT NULL,
                fetched_at TIMESTAMP,
                created_at TIMESTAMP,
                subreddit VARCHAR,
                title VARCHAR,
                body VARCHAR,
                url VARCHAR,
                score INTEGER,
                num_comments INTEGER,
                classification VARCHAR,
                PRIMARY KEY (code, post_id)
            )
            """
        )


def get_recent(code: str, days: int = 7) -> list[Mention]:
    """Return mentions for `code` whose posts were created within `days`.

    Filters on `created_at` (the Reddit post's own timestamp), not
    `fetched_at`, so old cached posts age out of the rolling window
    even when we don't refetch.
    """
    _ensure_table()
    cutoff = datetime.now() - timedelta(days=days)
    with prices._DB_LOCK:
        rows = (
            prices._db()
            .execute(
                """
                SELECT subreddit, post_id, title, body, url, score, num_comments,
                       classification, created_at, fetched_at
                FROM reddit_mentions
                WHERE code = ? AND created_at >= ?
                ORDER BY created_at DESC
                """,
                [code, cutoff],
            )
            .fetchall()
        )
    out: list[Mention] = []
    for r in rows:
        (
            subreddit,
            post_id,
            title,
            body,
            url,
            score,
            num_comments,
            classification,
            created_at,
            fetched_at,
        ) = r
        out.append(
            Mention(
                code=code,
                subreddit=subreddit,
                post_id=post_id,
                title=title or "",
                body=body or "",
                url=url or "",
                score=int(score or 0),
                num_comments=int(num_comments or 0),
                classification=classification,  # type: ignore[arg-type]
                created_at=created_at,
                fetched_at=fetched_at,
            )
        )
    return out


def put_batch(mentions: list[Mention]) -> int:
    """Upsert a batch of mentions. Returns the number written."""
    if not mentions:
        return 0
    _ensure_table()
    rows = [
        (
            m.code,
            m.post_id,
            m.fetched_at,
            m.created_at,
            m.subreddit,
            m.title,
            m.body,
            m.url,
            m.score,
            m.num_comments,
            m.classification,
        )
        for m in mentions
    ]
    with prices._DB_LOCK:
        prices._db().executemany(
            "INSERT OR REPLACE INTO reddit_mentions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
    return len(rows)


def latest_fetched_at(code: str) -> datetime | None:
    """Most recent `fetched_at` for `code`. Drives the 24h refetch gate.

    Uses ORDER BY ... LIMIT 1 instead of MAX() because DuckDB 1.5.2
    raises an internal "vector of size 0" error on MAX() over an
    empty filtered set in certain connection states.
    """
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT fetched_at FROM reddit_mentions WHERE code = ? "
            "ORDER BY fetched_at DESC LIMIT 1",
            [code],
        ).fetchone()
    return row[0] if row and row[0] else None

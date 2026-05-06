# v3 Reddit sentiment — new dimension

## Context

The current dashboard's only social/news signal is three yfinance
headlines per holding, surfaced inside `digest.py` and `insight.py`.
There is no read on retail-investor discussion, which is the most
visible signal layer for a Year-1 student watching a long-horizon
US-heavy book on weekends. TauricResearch/TradingAgents (a multi-agent
LLM trading framework) has a Sentiment Analyst that pulls Reddit; that
agent's *data fetch* is portable, the *agent itself* is not (the
framework outputs buy/sell decisions, banned by `feedback_financial
_framing.md`).

This plan adds a Reddit-discussion ingestor + per-ticker sentiment
classifier + an educational drill-in tile. Ships before
`v3-analyst-tiles.md`, which will consume this plan's output as its
Sentiment column.

Outcome: open the holdings drill-in for `US.NVDA` (or any held name),
see a quiet panel reading "Reddit discussion · past 7 days" with
post counts by tone, three representative posts, and an optional
[learn more] What/Meaning/Watch trio. No action language anywhere.

## Decisions locked

- **Data source: `praw`** (Python Reddit API Wrapper). Pushshift
  rejected (deprecated archive-only access). Reddit creds in `.env`,
  503 fallback when missing — same pattern as Anthropic surfaces.
- **Classifier: VADER** (`vaderSentiment` pip package). Rule-based,
  not LLM. Compound-score thresholds: `>0.05` positive, `<-0.05`
  negative, else neutral. LLM classification rejected: cost adds up
  per-post and prompt drift makes historical comparisons unreliable.
- **Subreddits**: `r/stocks`, `r/investing`, `r/wallstreetbets`,
  `r/SecurityAnalysis`, plus per-ticker subs when they exist
  (`r/NVDA_Stock`, `r/TSLA`, `r/Vitards`, etc. — discovered, not
  hardcoded; falls through silently when missing).
- **Lookback window**: 7 days. Long enough to span weekend / midweek
  cadence, short enough to keep the panel reflecting current
  discussion.
- **Cache**: DuckDB 24h TTL on `(code, fetched_at_date)`. No
  per-call rate-limit headache; praw's 60/min cap stays comfortable.
- **Surfacing**: drill-in only, no hero, no standalone page.
  Educational framing — observation, not signal.
- **Reuse advisor pattern** for the [learn more] trio. Static
  baseline (counts + bar + posts) renders even with no Anthropic key;
  Claude depth lazy-fetches.

## Architecture deltas

```
src/api/
├── reddit_sentiment.py       ← NEW: praw client + VADER classifier + aggregator
├── sentiment_insight.py      ← NEW: advisor pattern, What/Meaning/Watch
├── data/
│   └── reddit_cache.py       ← NEW: DuckDB-cached posts/comments
└── routes/
    ├── reddit.py             ← NEW: GET /api/reddit/{code}
    └── sentiment_insight.py  ← NEW: GET /api/sentiment-insight/{code}

web/src/components/
└── sentiment-block.tsx       ← NEW: drill-in tile, between notes + anomaly

web/src/lib/
└── api.ts                    ← MODIFIED: fetchReddit + fetchSentimentInsight
```

DuckDB schema (single migration applied at first import):

```sql
CREATE TABLE IF NOT EXISTS reddit_mentions (
  code VARCHAR,
  fetched_at TIMESTAMP,
  subreddit VARCHAR,
  post_id VARCHAR,
  title VARCHAR,
  body VARCHAR,
  url VARCHAR,
  score INTEGER,
  num_comments INTEGER,
  classification VARCHAR,    -- positive | neutral | negative (VADER)
  PRIMARY KEY (code, post_id)
);

CREATE TABLE IF NOT EXISTS sentiment_insight_cache (
  code VARCHAR NOT NULL,
  prompt_version VARCHAR NOT NULL,
  what VARCHAR,
  meaning VARCHAR,
  watch VARCHAR,
  generated_at TIMESTAMP,
  PRIMARY KEY (code, prompt_version)
);
```

## Backend

### `reddit_sentiment.py`

```python
@dataclass
class Mention:
    subreddit: str
    post_id: str
    title: str
    body: str
    url: str
    score: int
    num_comments: int
    classification: Literal["positive", "neutral", "negative"]
    created_at: datetime

@dataclass
class SentimentSummary:
    code: str
    days: int
    total_mentions: int
    buckets: dict[str, int]          # {"positive": N, "neutral": N, "negative": N}
    weighted_score: float            # sum(post.score * sign(classification)) / total_score
    top_mentions: list[Mention]      # 3 representative (top score per bucket)
    as_of: datetime
```

- `fetch_mentions(code, ticker, days=7) -> list[Mention]`
  - 24h DuckDB cache check first.
  - Else praw search across configured subreddits:
    `subreddit.search(f'"{ticker}"', sort="new", time_filter="week", limit=25)`.
  - Per post: VADER on `f"{title} {selftext[:500]}"`.
  - Persist via `data/reddit_cache.put_batch`.
- `_init_reddit() -> praw.Reddit | None`
  - Returns None if `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` /
    `REDDIT_USER_AGENT` missing. Routes translate None → 503.
- `classify(text) -> str`
  - Rule-based VADER. Compound score buckets per `Decisions locked`.
- `aggregate(mentions) -> SentimentSummary`
  - Pure function — no IO. Buckets, weighted score, top-3 selection.

### `sentiment_insight.py`

Advisor pattern. `_PROMPT_VERSION = "v1"`. 6h TTL.

```python
def get_insight(code: str, *, force_refresh: bool = False) -> SentimentInsight | None
```

- Loads `SentimentSummary` via `reddit_sentiment.fetch_mentions` +
  `aggregate`.
- Cache lookup → `_call_claude` (mirrors `insight.py:_call_claude`)
  → parse → store.
- Prompt:
  > You are summarising Reddit discussion volume and tone for
  > {ticker} ({name}) over the past 7 days for a long-horizon student
  > investor.
  > Output exactly three short lines, ≤22 words each:
  > What: <one sentence on volume + tone>
  > Meaning: <one sentence on what this signals to someone who already
  > owns this stock; observational, not directional>
  > Watch: <one sentence on what to observe as discussion shifts>
  > Forbidden: buy, sell, hold, trim, add, target, forecast, predict,
  > expect, recommend, surge, plunge, soar, crash, breakout, rally,
  > tank, should, ought, bullish, bearish, FOMO, panic, capitulation,
  > euphoric.
  > Frame everything as observation. Plain English. No jargon.
  >
  > Context:
  > {summary as JSON}
  > Output: just the three lines, prefixed What:/Meaning:/Watch:.
- Failure tolerance: malformed parse → return `None`, log warning,
  cache `None` for 1h to avoid hammering.

### `data/reddit_cache.py`

- `_DB_LOCK` reuse from `data/prices.py`. Single-writer.
- `get_recent(code, days) -> list[Mention]` — joins `reddit_mentions`
  by `code` filtered to `fetched_at >= now() - INTERVAL ? DAY`.
- `put_batch(code, mentions)` — upsert keyed on `(code, post_id)`.

### Routes

- `GET /api/reddit/{code}?days=7` →
  ```
  {
    code,
    days,
    total_mentions,
    buckets: {positive, neutral, negative},
    weighted_score,
    top_mentions: [
      { subreddit, post_id, title, score, num_comments, url, classification }
    ],
    as_of
  }
  ```
  - 503 if praw not configured (`REDDIT_CLIENT_ID` missing).
  - 200 with `total_mentions: 0` and empty arrays when no posts found.
- `GET /api/sentiment-insight/{code}?refresh=true` →
  `{ what, meaning, watch }` or 503 missing Anthropic key.

### `src/api/main.py`

- `from api.routes import reddit, sentiment_insight` and register both
  with `prefix="/api"`.

### `.env`

```
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=investment-dashboard/0.1 by <reddit_username>
```

Documented in a new `reddit-setup.md` next to `moomoo-opend-setup.md`.
README "Run with two terminals" section gets a one-line note pointing
to it.

## Frontend

### `web/src/components/sentiment-block.tsx`

- `"use client"`. Mounted in holdings drill-in between `notes-block`
  and `anomaly-block`. Same in watchlist drill-in by symmetry.
- Props: `{ code: string }`. Fetches `/api/reddit/{code}` on mount.
- Render:
  - Header: `Reddit discussion · past 7 days`
  - Three quiet number cells: `12 positive · 18 neutral · 4 negative`.
    Tabular figures, `--whisper` color for the labels.
  - Mini horizontal stacked bar (single ink family — `--ink` saturated
    for negative, `--quiet` for neutral, `--ink` desaturated for
    positive). No green/red, per DESIGN.md.
  - Top-3 representative posts as a collapsed list:
    `r/{subreddit} · {score}↑ — {title}`. Click expands a single line
    of body excerpt + outbound link (opens in new tab,
    `rel="noopener noreferrer"`).
  - `[learn more]` toggle → fetches `/api/sentiment-insight/{code}`
    lazy. Effect deps include only `[expanded]`, NOT
    `[expanded, insight.kind]` — bit twice already, see
    `feedback_lazy_fetch_deps.md`.
- Empty state (`total_mentions === 0`): italic "No discussion in the
  past 7 days." `--whisper` color. No CTA.
- 503 from `/api/reddit/{code}`: italic "Reddit not configured —
  add credentials in .env" with link to `reddit-setup.md`. No retry
  button.
- 503 from `/api/sentiment-insight/{code}`: collapsed `[learn more]`
  shows "Anthropic key not set" hint.

### `web/src/lib/api.ts`

- Add `RedditMention`, `RedditResponse`, `SentimentInsightResponse`,
  `SentimentInsightResult` types mirroring Pydantic models.
- Add `fetchReddit(code, days = 7): Promise<RedditResponse>`.
- Add `fetchSentimentInsight(code, refresh?): Promise<SentimentInsightResult>`
  — discriminated-union 503 → unavailable, matches existing pattern.

### Drill-in slot

- `web/src/components/holdings-table.tsx` drill-in:
  insert `<SentimentBlock code={position.code} />` between the
  notes block and the anomaly block. Order:
  1. PriceChart
  2. InsightBlock (Meaning + Watch)
  3. NotesBlock
  4. **SentimentBlock**  ← NEW
  5. AnomalyBlock
- `web/src/components/watchlist-table.tsx` drill-in: same insertion
  point.

## `Coding Projects/investment-dashboard/CLAUDE.md`

To bump after the chunk ships, NOT during this plan write:

- `## Status` line bumped (date + "Reddit sentiment shipped").
- `## Surfaces` `/portfolio` drill-in description gains a Reddit
  bullet.
- `## Architecture` adds the new modules to the `src/api/` tree.
- `## Verification` gains a `/api/reddit/...` curl line.

## Critical files

### Created
- `Coding Projects/investment-dashboard/src/api/reddit_sentiment.py`
- `Coding Projects/investment-dashboard/src/api/sentiment_insight.py`
- `Coding Projects/investment-dashboard/src/api/data/reddit_cache.py`
- `Coding Projects/investment-dashboard/src/api/routes/reddit.py`
- `Coding Projects/investment-dashboard/src/api/routes/sentiment_insight.py`
- `Coding Projects/investment-dashboard/web/src/components/sentiment-block.tsx`
- `Coding Projects/investment-dashboard/reddit-setup.md`

### Modified
- `Coding Projects/investment-dashboard/src/api/main.py` — register routers
- `Coding Projects/investment-dashboard/src/api/models.py` — Mention, SentimentSummary, SentimentInsight Pydantic models
- `Coding Projects/investment-dashboard/web/src/lib/api.ts` — types + fetchers
- `Coding Projects/investment-dashboard/web/src/components/holdings-table.tsx` — drill-in slot
- `Coding Projects/investment-dashboard/web/src/components/watchlist-table.tsx` — drill-in slot
- `Coding Projects/investment-dashboard/pyproject.toml` — `praw`, `vaderSentiment` deps
- `Coding Projects/investment-dashboard/.env.example` — Reddit creds
- `Coding Projects/investment-dashboard/CLAUDE.md` — surfaces / architecture / verification (post-implementation)

### Reused (read-only)
- `src/api/data/prices.py:_DB_LOCK + _db()` — single-writer pattern
- `src/api/insight.py:_call_claude` — Claude SDK call shape
- `src/api/digest.py` forbidden-words list — copied verbatim into
  `sentiment_insight.py` prompt
- `src/api/foresight_insight.py` — three-line What/Meaning/Watch
  prompt skeleton
- `web/src/components/insight-block.tsx` — skeleton + ready / unavailable
  / error state machine
- `web/src/lib/api.ts` `Result<T>` discriminated union pattern

## Verification

End-to-end after the chunk ships:

1. **Reddit creds present.**
   `curl -s localhost:8000/api/reddit/US.NVDA | jq '.total_mentions'`
   ≥ 1 on a typical day.
2. **Reddit creds missing.** Same call without `REDDIT_CLIENT_ID` →
   503 with body `{"detail":"Reddit not configured"}`.
3. **VADER classifier sanity.** Hand-pick 5 obviously positive posts
   and 5 obviously negative posts; classifier ≥ 8/10 correct buckets.
4. **Cache hit.** Second `/api/reddit/...` call within 24h hits
   DuckDB only — wall clock < 200ms; no praw HTTP traffic visible
   in dev console.
5. **Insight forbidden-words guard.**
   `curl -s localhost:8000/api/sentiment-insight/US.NVDA | jq -r '[.what,.meaning,.watch] | join(" ")' | grep -E "(buy|sell|hold|trim|add|target|forecast|predict|expect|recommend|surge|plunge|soar|crash|breakout|rally|tank|should|ought|bullish|bearish|FOMO|panic|capitulation|euphoric)"`
   returns nothing.
6. **Frontend drill-in.** Open `/portfolio`, click `US.NVDA` row.
   SentimentBlock renders between notes and anomaly. Counts match
   the API. Bar reflects ratios. Top-3 posts link out to Reddit
   (open in new tab).
7. **Theme toggle.** Cycle `system → light → dark → system`. Block
   honors theme tokens; no hardcoded colors.
8. **Empty state.** Pick a thinly-discussed name (e.g. `K71U.SG`);
   block shows "No discussion in the past 7 days" without errors.
9. **Lazy [learn more].** Click toggle, three-line block fetches once,
   subsequent expand/collapse cycles do not refetch.
10. **No regressions.** Daily digest, holdings table, foresight, and
    SSE live ticks all render and behave as before.

## Out of scope (this plan)

- **Twitter/X sentiment** — no free API tier since 2023.
- **Discord / Telegram** — different access model, would need scrapers.
- **LLM-based classification** — cost + drift, deferred indefinitely.
- **Sentiment time-series chart** — v1 is a snapshot; trend chart
  needs longer history first.
- **Cross-ticker sentiment comparison views** ("NVDA vs AMD on
  Reddit") — bait for action language.
- **Alerts on sentiment swings** ("rapid uptick in mentions") — would
  flirt with action language.
- **Pushshift / archived data** — Pushshift's archive-only access
  doesn't cover the 7-day live window we need.
- **Streaming new mentions** — D5 SSE infrastructure exists but
  pushing Reddit ticks would explode rate limits and undermine
  principle-#2 (calm-under-volatility).

## Sequencing

`v3-analyst-tiles.md` depends on this plan shipped. Plan B's
Sentiment tile reads `reddit_sentiment.fetch_mentions` + `aggregate`
directly. If this plan is paused, Plan B can stub the Sentiment tile
to "Reddit signal unavailable" without otherwise changing.

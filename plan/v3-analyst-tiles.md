# v3 Analyst tiles — per-ticker four-dimension digest

## Context

The current daily digest (`src/api/digest.py`, surfaced as
`<DailyDigest>` on `/`) emits a single LEAD line + one one-sentence
summary per held ticker. It's compact but flattens four very different
signal layers (fundamentals, news, sentiment, technicals) into a single
prose sentence; per-ticker the user can't tell which dimension drove
the line.

TauricResearch/TradingAgents (a multi-agent LLM trading framework)
splits its analysis into four analyst roles: **Fundamentals**, **News**,
**Sentiment**, **Technical**. The framework's runtime (LangGraph
multi-agent debate, Trader synthesis, Risk Manager approve/reject) is
incompatible with `feedback_financial_framing.md` (no buy/sell/target/
predict). But the *prompt-decomposition pattern* — splitting one
synthesis into four role-scoped passes — is portable and produces a
more legible per-ticker breakdown.

This plan replaces the single-blob digest with a per-ticker
four-tile grid: Fundamentals · News · Sentiment · Technical, each
one short observational sentence. Borrows TradingAgents' role split
as prompt-engineering only; no LangGraph, no multi-agent runtime,
no debate, no synthesis, no action language.

Outcome: open `/`, see daily digest as a per-ticker grid where each
holding owns four small tiles. A glance reveals which dimension is
"loud" this week without reading every line.

## Decisions locked

- **Four tiles, fixed**: Fundamentals · News · Sentiment · Technical.
  No Trader synthesis tile (forbidden — action language). No Risk
  Manager tile (`concentration_insight.py` covers risk
  observationally already). No Researcher debate (forbidden —
  directional bias).
- **Single-shot per tile**, parallel per ticker. Each analyst module
  is one Claude call. Four calls × N holdings, fanned out via
  `asyncio.gather`. No tool use, no multi-turn.
- **Cache key**: `(code, _PROMPT_VERSION)`. New table
  `digest_tiles_cache` — old `digest_cache` (single-blob) left in
  place, harmless residue. `_PROMPT_VERSION = "v2"` invalidates any
  pre-existing tile data when prompts evolve.
- **Tile sentence ≤ 22 words.** Forbidden-words list verbatim from
  `digest.py`. Role-specific bans extend per tile (see Module design).
- **Frontend**: single rewrite of `daily-digest.tsx`. Per-ticker row;
  4-column grid on `≥md`; stacked vertically below `md` (D4 mobile
  not yet shipped — the stacked layout works on every viewport in
  the meantime).
- **Sentiment tile depends on `v3-reddit-sentiment.md` shipped.**
  If Reddit creds missing, Sentiment tile renders the static fallback
  string `"Reddit signal unavailable"` (not a Claude call).
- **Static-baseline fallback**: when `ANTHROPIC_API_KEY` is unset,
  `<DailyDigest>` renders a compact one-line-per-ticker fallback
  ("{ticker}: see drill-in for context") rather than crashing.
- **Breaking change** to `/api/digest` payload shape. Only one
  consumer (`web/src/components/daily-digest.tsx`) — explicit grep
  confirms no other reader before shipping.

## Architecture deltas

```
src/api/
├── digest.py                 ← REWRITTEN: orchestrates 4 analyst calls per ticker
├── analysts/                 ← NEW package
│   ├── __init__.py
│   ├── _base.py              ← shared Claude call + forbidden-words list
│   ├── fundamentals.py       ← capital-flow anomalies + earnings + currency
│   ├── news.py               ← yfinance headlines + macro events
│   ├── sentiment.py          ← reads reddit_sentiment (Plan A)
│   └── technical.py          ← technical anomalies + 30-day price move
├── models.py                 ← MODIFIED: AnalystTiledDigest, TickerTiles
└── routes/
    └── digest.py             ← MODIFIED: returns AnalystTiledDigest

web/src/components/
└── daily-digest.tsx          ← REWRITTEN: per-ticker grid of 4 tiles
```

DuckDB schema:

```sql
CREATE TABLE IF NOT EXISTS digest_tiles_cache (
  code VARCHAR NOT NULL,
  prompt_version VARCHAR NOT NULL,
  fundamentals VARCHAR,
  news VARCHAR,
  sentiment VARCHAR,
  technical VARCHAR,
  generated_at TIMESTAMP,
  PRIMARY KEY (code, prompt_version)
);
```

The old `digest_cache` table is not dropped — cheap, harmless.

## Module design

### `src/api/analysts/_base.py`

```python
FORBIDDEN_BASE = [
    "buy", "sell", "hold", "trim", "add", "target", "forecast",
    "predict", "expect", "recommend", "surge", "plunge", "soar",
    "crash", "breakout", "rally", "tank", "should", "ought",
]

@dataclass
class AnalystOutput:
    sentence: str          # ≤22 words, no forbidden words
    is_quiet: bool         # true when context is empty → "Quiet on X this week"

async def call_analyst(
    role: str,                    # "Fundamentals" | "News" | "Sentiment" | "Technical"
    ticker: str,
    name: str,
    context: dict,
    role_specific_bans: list[str],
) -> AnalystOutput:
    """Single Claude call. Returns AnalystOutput or raises on parse fail."""
```

- Prompt template:
  > You are the {role} analyst on a long-horizon investor's reading
  > desk for {ticker} ({name}). Write ONE sentence, ≤22 words, plain
  > English. Frame as observation only.
  >
  > Forbidden words (anywhere in your output): {FORBIDDEN_BASE +
  > role_specific_bans, comma-separated}.
  >
  > Context:
  > {json.dumps(context, indent=2)}
  >
  > If the context is empty or all-null, output exactly:
  > "Quiet on {role.lower()} this week."
  >
  > Output: just the sentence. No preamble, no quotes, no markdown.
- Post-validation: scan output for forbidden words; if any matched,
  retry once with a stricter system prompt; if still failing, fall
  back to `"Quiet on {role.lower()} this week."` and log the
  violation.
- SDK call shape mirrors `src/api/insight.py:_call_claude`. Reuses
  `ANTHROPIC_DIGEST_MODEL` env var. `max_tokens=80` (one short
  sentence).

### `src/api/analysts/fundamentals.py`

- `get_take(code, ticker, name) -> AnalystOutput`
- Context built from:
  - `data/anomalies.py:get_financial_unusual` plain-English summary
    (capital-flow signals: 主力资金流入/流出, 成交量异动, 大单).
  - Nearest earnings date from `earnings.get_all()` (today vs nearest
    forward `report_date`).
  - Currency (USD / SGD / HKD / CN).
- Role-specific bans: `cheap`, `expensive`, `undervalued`,
  `overvalued`, `fairly valued`.

### `src/api/analysts/news.py`

- Context built from:
  - Top-3 yfinance headlines for the ticker (already used in
    `digest.py`).
  - Macro events from `macro_events.get_within(7)` filtered by
    ticker-affinity rules (FOMC + CPI for everything; PPI for
    everything; NFP for everything; sector-specific filters can
    come later).
- Role-specific bans: `breaking`, `shocking`, `surprising`,
  `unexpected`, `bombshell`.

### `src/api/analysts/sentiment.py`

- Depends on `v3-reddit-sentiment.md`.
- Context built from
  `reddit_sentiment.aggregate(reddit_sentiment.fetch_mentions(code, ticker))`.
- If `_init_reddit()` returns `None` (creds missing), the analyst
  short-circuits and returns
  `AnalystOutput(sentence="Reddit signal unavailable.", is_quiet=True)`
  without a Claude call.
- Role-specific bans: `bullish`, `bearish`, `FOMO`, `panic`,
  `capitulation`, `euphoric`, `meme`.

### `src/api/analysts/technical.py`

- Context built from:
  - `data/anomalies.py:get_technical_unusual` plain-English summary
    (KDJ cross, MA touch, BOLL band, RSI extreme, MACD cross).
  - 30-day price move % from `data/prices.py`.
- Role-specific bans: `breakout`, `breakdown`, `support`, `resistance`
  used as *prediction* (allowed as descriptive past, e.g. "tested
  the 50-day moving average yesterday" is fine).
- Validation: forbidden-word matching is case-insensitive but
  *substring-aware* — "breakout" trips, "breakouts" trips, but the
  neutral phrase "tested the 50-day" passes.

## `digest.py` orchestration

```python
@dataclass
class TickerTiles:
    code: str
    ticker: str
    fundamentals: str
    news: str
    sentiment: str
    technical: str

@dataclass
class AnalystTiledDigest:
    as_of: datetime
    holdings: list[TickerTiles]
```

```python
async def get_digest(holdings) -> AnalystTiledDigest:
    """6h cache; concurrent per-ticker, concurrent per-tile within ticker."""
```

- Per ticker:
  1. Cache lookup `(code, _PROMPT_VERSION)`. 6h TTL. Hit returns
     immediately.
  2. Miss: gather context across the four data layers (concurrent
     by data source, not by ticker).
  3. `asyncio.gather` over the four analyst modules. Each module
     manages its own Claude call and returns its sentence.
  4. Persist tile row.
- Cross-ticker: `asyncio.gather` over the holdings list, bounded by
  a `Semaphore(4)` to keep Claude QPS sane.
- `_PROMPT_VERSION = "v2"` (bumped from v1's single-blob digest).

## Routes

- `GET /api/digest` → `AnalystTiledDigest`. Same path; payload shape
  changes.
- `GET /api/digest?refresh=true` continues to bypass cache.

## Frontend

### `web/src/components/daily-digest.tsx` (rewrite)

- Header: "Daily digest · {as_of}". Caption underneath: "{N} holdings,
  four dimensions each".
- Body: per-ticker row, each row containing:
  - Ticker chip (left, sticky on horizontal scroll if needed).
  - 4-column grid on `≥md`: Fundamentals · News · Sentiment ·
    Technical. Each tile is a small `aside`-style block:
    - Caption header (whisper color, mono): `Fundamentals`
    - Sentence (ink color, sans).
- Below `md` (mobile): tiles stack vertically per ticker with a
  hairline divider between dimensions.
- Loading skeleton: per-ticker row with four quiet rectangles.
- Empty state for one tile: `"Quiet on news this week."` rendered
  in italic whisper color, no special treatment.
- 503 path (Anthropic key missing): collapse the grid to a compact
  one-line-per-ticker static fallback that just says
  `"{ticker}: see drill-in for context."`. Surfaces tiles cleanly
  when the key returns.
- 503 path on `/api/reddit/...` (no Reddit creds): only the
  Sentiment tile reads `"Reddit signal unavailable."`; other three
  tiles populate normally.

### `web/src/lib/api.ts`

- Update `DigestResponse` type: `{ as_of, holdings: TickerTiles[] }`.
  Remove old `LEAD` / `prose` fields.
- `fetchDigest()` signature unchanged.

### `web/src/app/page.tsx`

- No JSX changes — `<DailyDigest initial={digest} />` continues.
  `digest` shape changes; the component handles the new payload.

## `Coding Projects/investment-dashboard/CLAUDE.md`

To bump after the chunk ships, NOT during this plan write:

- `## Status` line bumped (date + "analyst-tile digest shipped").
- `## Surfaces` `/` home description rewritten:
  - Daily digest description changes from "LEAD line + per-ticker
    one-sentence summaries" to "Per-ticker four-dimension grid
    (Fundamentals · News · Sentiment · Technical), each tile one
    observational sentence. Sentiment tile reads from Reddit
    (gracefully degrades if creds missing)."
- `## Architecture` adds the `analysts/` package to the `src/api/`
  tree.
- `## Verification` updates the `/api/digest` curl snippet.

## Critical files

### Created
- `Coding Projects/investment-dashboard/src/api/analysts/__init__.py`
- `Coding Projects/investment-dashboard/src/api/analysts/_base.py`
- `Coding Projects/investment-dashboard/src/api/analysts/fundamentals.py`
- `Coding Projects/investment-dashboard/src/api/analysts/news.py`
- `Coding Projects/investment-dashboard/src/api/analysts/sentiment.py`
- `Coding Projects/investment-dashboard/src/api/analysts/technical.py`

### Modified
- `Coding Projects/investment-dashboard/src/api/digest.py` — rewrite as orchestrator
- `Coding Projects/investment-dashboard/src/api/models.py` — `TickerTiles`, `AnalystTiledDigest`; drop the old single-blob digest models if unused elsewhere
- `Coding Projects/investment-dashboard/src/api/routes/digest.py` — return new type
- `Coding Projects/investment-dashboard/web/src/components/daily-digest.tsx` — full rewrite
- `Coding Projects/investment-dashboard/web/src/lib/api.ts` — `DigestResponse` shape
- `Coding Projects/investment-dashboard/CLAUDE.md` — surfaces / architecture / verification (post-implementation)

### Reused (read-only)
- `src/api/data/anomalies.py:get_technical_unusual + get_financial_unusual` — fundamentals / technical context
- `src/api/earnings.py:get_all` — fundamentals nearest-report date
- `src/api/macro_events.py:get_within` — news macro slot
- `src/api/reddit_sentiment.py:fetch_mentions + aggregate` — sentiment context (Plan A)
- `src/api/insight.py:_call_claude` — Claude SDK call shape
- `src/api/data/prices.py:_DB_LOCK + _db()` — DuckDB single-writer
- `src/api/foresight.py` — concurrency pattern reference (asyncio.gather across data sources)

## Verification

End-to-end after the chunk ships:

1. **Payload shape.**
   `curl -s localhost:8000/api/digest | jq '.holdings[0]'` →
   `{code, ticker, fundamentals, news, sentiment, technical}` all
   non-empty strings.
2. **Word-count budget.**
   `curl -s localhost:8000/api/digest | jq -r '.holdings[].fundamentals, .holdings[].news, .holdings[].sentiment, .holdings[].technical' | awk '{print NF}' | sort -n | tail -1`
   ≤ 22.
3. **Forbidden-words guard, full payload.**
   `curl -s localhost:8000/api/digest | jq -r '.. | strings' | grep -iE "(buy|sell|hold|trim|add|target|forecast|predict|expect|recommend|surge|plunge|soar|crash|breakout|rally|tank|should|ought|cheap|expensive|undervalued|overvalued|breaking|shocking|surprising|unexpected|bullish|bearish|FOMO|panic|capitulation|euphoric|bombshell|meme)"`
   returns nothing.
4. **Cache hit.** Second `/api/digest` call within 6h → wall clock
   < 200ms; no Claude HTTP traffic.
5. **`_PROMPT_VERSION` invalidation.** Bump `_PROMPT_VERSION = "v2.1"`
   on a tile prompt edit, restart server, hit `/api/digest` →
   regenerates only that tile (others still cached).
6. **No Anthropic key.** Unset `ANTHROPIC_API_KEY`, restart server,
   `curl /api/digest` → 503 with helpful body. Frontend shows the
   compact fallback per ticker.
7. **No Reddit key.** Unset `REDDIT_CLIENT_ID`, hit `/api/digest` →
   200 with Sentiment tile reading `"Reddit signal unavailable."`;
   other three tiles populate normally.
8. **Single-consumer audit.**
   `grep -rE "fetchDigest|/api/digest" web/src/` returns only
   `web/src/components/daily-digest.tsx` and `web/src/lib/api.ts`.
9. **Frontend grid.** Open `/`, daily digest renders four-column
   grid per ticker on desktop; stacks vertically on a 375px viewport.
   Loading state shows skeleton tiles; theme toggle cycles cleanly.
10. **No regressions.** Hero, foresight, holdings table, watchlist,
    benchmark, concentration, SSE live ticks all render and behave
    as before.

## Out of scope (this plan)

- **Multi-agent orchestration / LangGraph.** TradingAgents' debate
  loop is incompatible with this dashboard's framing rule; plan
  borrows prompt structure only.
- **Researcher debate (bull vs bear)** — directional bias, banned.
- **Trader synthesis tile** — action language, banned.
- **Risk Manager tile** — `concentration_insight.py` already covers
  risk observationally.
- **Tile-level [learn more] drill-in** — would explode call cost
  (4 tiles × N holdings × extra What/Meaning/Watch). Drill-in
  context already lives at `/api/insight/{code}` for the ticker.
- **Historical digest archive** — each day's tiles overwrite the
  previous via cache TTL; no rolling window stored.
- **Cross-ticker comparison tiles** ("NVDA outperforming AMD on
  news") — bait for action language.
- **Sector / theme grouping** of the per-ticker rows. Flat order
  for v1; matches current digest.

## Sequencing

Hard dependency on `v3-reddit-sentiment.md`. If Plan A is paused,
the Sentiment tile stays as the static fallback string and the rest
of this plan still ships. After Plan A lands, re-enable the
sentiment analyst's Claude call by removing the short-circuit.

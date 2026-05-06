# Reddit setup — no setup needed

The drill-in's "Reddit discussion · past 7 days" panel reads from
Reddit's **public JSON endpoints** (just append `.json` to any
subreddit URL — no auth, no API key, no credentials). It works out
of the box.

## Why no API key?

Reddit's November 2025 Responsible Builder Policy gates all new OAuth
script-type apps behind a manual review queue (days to weeks). The
public read-only JSON endpoints remain unauthenticated and rate-limited
on User-Agent identification (~60 req/min for descriptive UAs).

The dashboard's call pattern (≤7 subreddits per ticker, cached 24h in
DuckDB) sits comfortably inside that envelope.

## Optional: customize the User-Agent

Reddit asks UAs identify the app + operator. The dashboard ships with
a sensible default:

```
investment-dashboard/0.1 (long-horizon personal dashboard)
```

To override, add the following to `.env`:

```
REDDIT_USER_AGENT=investment-dashboard/0.1 by /u/<your_reddit_username>
```

## Verify

After `uv run api`:

```bash
curl -s localhost:8000/api/reddit/US.NVDA | jq '.total_mentions'
```

Should return a non-negative integer. If it's 0 every time, check your
network can reach `https://www.reddit.com` from this machine.

## Rate limits + caching

The dashboard caches per-ticker results in DuckDB for 24h, so a single
drill-in expand costs at most one fetch every 24 hours per code. Each
fetch sequentially queries the global subs (r/stocks, r/investing,
r/wallstreetbets, r/SecurityAnalysis) plus per-ticker candidate subs
with a ~1.1s pause between requests. Effective load: ≤ 8 GETs / day /
ticker, well under Reddit's unauth ceiling.

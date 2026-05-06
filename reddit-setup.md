# Reddit API setup

The drill-in's "Reddit discussion · past 7 days" panel reads from the
Reddit API via `praw`. Without credentials, the panel renders a quiet
"Reddit not configured" hint and the rest of the drill-in keeps working
— the rest of the dashboard is unaffected.

## What you need

Three environment variables, all set in `.env`:

```
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=investment-dashboard/0.1 by <your_reddit_username>
```

## How to get them

1. Sign in at <https://www.reddit.com/prefs/apps>.
2. Scroll to **"are you a developer? create an app..."** at the bottom.
3. Click **"create another app..."** (or "create app" if it's your first).
4. Fill in:
   - **name**: `investment-dashboard` (or anything you want)
   - **type**: select **"script"**
   - **description**: leave blank
   - **about url**: leave blank
   - **redirect uri**: `http://localhost:8000` (required, not actually used)
5. Click **"create app"**.
6. Copy the values:
   - `REDDIT_CLIENT_ID` — the short string under your app name (just below
     "personal use script", looks like `abc123XYZ`).
   - `REDDIT_CLIENT_SECRET` — the longer "secret" field.
   - `REDDIT_USER_AGENT` — set this to anything descriptive that includes
     your Reddit username, e.g.
     `investment-dashboard/0.1 by /u/your_reddit_username`. Reddit asks
     that the user agent identify the app and operator.

## Verify

After saving `.env` and restarting the FastAPI server (`uv run api`):

```bash
curl -s localhost:8000/api/reddit/US.NVDA | jq '.total_mentions'
```

Should return a non-negative integer. `503` with
`{"detail":"Reddit not configured…"}` means the env vars didn't load —
restart the server and confirm `.env` is in the project root.

## Rate limits

`praw` honours Reddit's 60 requests / minute soft limit automatically.
The dashboard caches per-ticker results in DuckDB for 24h, so a single
drill-in expand costs at most one fetch every 24 hours per code.

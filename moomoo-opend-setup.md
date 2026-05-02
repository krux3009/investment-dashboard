# moomoo OpenD setup — foundation for investment-dashboard

**Status:** connection verified 2026-05-02 ~00:24 local · paused at the "what to build first" fork

This is the connectivity layer the dashboard will sit on top of. OpenD is the local gateway between Python and the moomoo brokerage; everything the dashboard needs (live quotes, klines, positions, anomalies) flows through it.

## Current state

- moomoo OpenD GUI 10.4.6408 installed at `/Applications/moomoo_OpenD.app`, launched and logged in
- API listening on `127.0.0.1:11111` (default)
- `quote_ctx.get_global_state()` returns `qot_logined=True`, `trd_logined=True`, `server_ver=1004` — verified
- Python SDK `moomoo-api==10.4.6408` installed system-wide via `pip3` (Python 3.14)
- Common deps installed: `backtrader 1.9.78.123`, `matplotlib 3.10.7`, `pandas 3.0.2`, `numpy 2.3.5`
- Skill version stamp written: `~/.moomoo_skill_version` = `0.1.1`
- Verify script lives at `/tmp/check_opend.py` (ephemeral — recreate if needed)

## Next-step fork (deferred)

Four directions to take from here, ordered by scope:

1. **Live quote / kline puller** for watchlist tickers (`US.PLTR`, `US.ANET`, `US.VRT` — active investing theses in `wiki/investing/`). Smallest scope, ~20 lines. **Most natural seed for the dashboard.**
2. **Wire up the anomaly skills** (`/moomoo-technical-anomaly`, `/moomoo-capital-anomaly`, `/moomoo-derivatives-anomaly`) — already installed, will work now that OpenD is up.
3. **Backtest the A-股 strategy** in vault root `提示词.txt` (综合模拟交易组合系统 v2.0, multi-strategy w/ regime filter) using `backtrader` against historical klines from OpenD. Largest scope, multi-file.
4. **Nothing further** — connection-verified, done.

## Constraints

- The install skill explicitly forbids calling `unlock_trade` from the SDK. Trade unlock must happen in the OpenD GUI manually — deliberate human-in-the-loop checkpoint.
- OpenD must be running before any SDK call. If the dashboard runs as a long-lived process, it needs to handle OpenD restarts / disconnects gracefully.

## Reference

Full install run, version table, and insights: 2026-05-02 `install-moomoo-opend` skill run (session `4f21b71a-0538-4362-b043-e93d91eaf294`).

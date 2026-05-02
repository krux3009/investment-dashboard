# Product

## Register

product

## Users

Single user. A first-year university student / AI-company intern based in Singapore, investing for the long horizon — holding positions for months or quarters across US, HK, and (occasionally) A-share markets. Active theses sit in AI infrastructure (PLTR, ANET, VRT); watchlist extends to NVDA, TSLA, 700.HK and others.

The user already has a Me Vault knowledge base with deep-dive notes on each holding. Trading happens through moomoo, with the local moomoo OpenD gateway as the data source for this dashboard.

The job to be done has two modes:
- **Daily glance (15 seconds, often on phone or laptop)** — is anything materially different today? Did any of my holdings or watchlist tickers do something I should care about?
- **Weekend study session (30+ minutes, laptop)** — sit with the data. Read anomaly signals against the thesis. Decide whether positions still make sense.

The dashboard is *not* a trading floor. Order placement and trade unlock stay deliberately in the moomoo native app — this is a thinking surface, not an execution surface.

## Product Purpose

A personal-use investment dashboard built on top of moomoo OpenD, designed to replace the noise of consumer-broker UIs with something quiet enough to think in.

It surfaces:
- Portfolio P&L and per-position state at a glance
- Watchlist quotes for tickers under research
- Anomaly signals (technical, capital-flow, derivatives) drawn from existing moomoo skills, surfaced as "what changed today"

Success looks like:
- I check it daily without feeling more anxious afterward
- I can spot something worth investigating without being told what to do about it
- It scales from a 15-second phone glance to a 30-minute weekend sit-down without changing apps

This dashboard is not for sharing, demoing, or shipping to others. Singular audience.

## Brand Personality

**Quiet · Precise · Considered.**

Voice and tone: matter-of-fact, never breathless. Numbers are reported, not celebrated. A 5% move gets the same typographic treatment as a 0.2% move; the data does the talking. No exclamation marks, no urgency theater, no "you're up!" copy.

Emotional goal: calm. The investor's edge is not reacting; the dashboard's job is to support that.

## Anti-references

Explicitly not these:

- **Bloomberg / MarketWatch full-clone.** Twenty widgets, blinking tickers, every metric possible. Overwhelming for a single-person tracker.
- **Crypto neon-on-black hype look.** Hot pink / cyan on near-black, glow effects, "to the moon" energy. Wrong audience for a long-horizon holder.
- **Robinhood-style gamified retail.** Gotcha-green, candy gradients, confetti animations, big-number-flex hero. Treats investing like Candy Crush — the opposite of the desired posture.
- **Generic LLM-default SaaS dashboard.** Inter font + slate-blue + cards-nested-in-cards + 12px padding everywhere. The aesthetic that signals "AI made that."

## Design Principles

1. **Information first, decoration last.** Every element earns its place by communicating something. No charts-for-the-sake-of-charts, no widgets without a job.

2. **Calm under volatility.** When the market is loud, the UI is quiet. No urgency theater, no flashing prices, no oversized red P&L hero. Hierarchy is steady.

3. **Two modes share one vocabulary.** The daily-glance view and the weekend-study view are the same design language at different densities, not separate apps. A glance scales into a study session by drilling in, never by switching surfaces.

4. **Long-horizon tracker, not a trading floor.** Built for months-to-quarters holdings. No order-execution drama, no minute-by-minute P&L oscillation, no countdown timers. Trade execution lives in the moomoo native app on purpose.

5. **Signals, not commands.** Anomaly skills surface what's unusual; the UI never tells the user what to do about it. Notation over recommendation.

## Accessibility & Inclusion

- **Color-blindness safe.** Gain/loss never relies on green/red alone. Always paired with arrows (↑/↓), sign (+/−), or positional cue. The same rule applies to anomaly severity coding.
- **Dark/light parity.** Both modes are first-class. Neither is an afterthought. Theme follows ambient context, not category reflex.
- **WCAG AA contrast** as the default floor for body text and UI chrome.
- **Reduced-motion respected** if motion ever gets introduced. Default to little motion regardless.

// UI string registry. Flat keys, dot-namespaced.
//
// Translations marked v1 — review pass needed (zh).
// Quiet/precise/considered register per PRODUCT.md — no exclamation marks,
// no marketing tone. Brackets in tokens like "[learn more]" / "[hide]"
// preserved across locales for visual consistency.
//
// Interpolation: substrings like {n}, {time}, {date} are replaced by
// `useT(key, params)` at call sites.

import type { Locale } from "./locale-provider";

export const STRINGS = {
  en: {
    // ── nav / chrome ────────────────────────────────────────────────
    "nav.brand": "quiet ledger",
    "nav.home": "home",
    "nav.portfolio": "portfolio",
    "nav.watchlist": "watchlist",

    "toggle.theme.label": "theme",
    "toggle.theme.aria": "Theme: {label}. Click to cycle.",
    "toggle.locale.aria": "Language: {label}. Click to toggle.",

    // ── shared / common ─────────────────────────────────────────────
    "common.what": "What",
    "common.meaning": "Meaning",
    "common.watch": "Watch",
    "common.hide": "[hide]",
    "common.learn_more": "[learn more]",
    "common.drafting_commentary": "Drafting commentary…",
    "common.commentary_unavailable": "commentary unavailable: {detail}",
    "common.insight_unavailable": "insight unavailable: {detail}",

    // ── live indicator ──────────────────────────────────────────────
    "live.connecting": "Connecting…",
    "live.reconnecting": "Reconnecting…",
    "live.live": "Live",
    "live.live_tick": "Live · last tick {time} SGT",
    "live.market_closed": "Market closed · next open {when}",
    "live.idle": "Idle",

    // ── time / formatRelative ───────────────────────────────────────
    "time.just_now": "just now",
    "time.moments_ago": "moments ago",
    "time.minutes_ago": "{n} min ago",
    "time.hours_ago": "{n} hr ago",
    "time.days_ago": "{n} day ago",
    "time.seconds_ago": "{n}s ago",
    "time.hours_ago_short": "{n}h ago",

    // ── hero ────────────────────────────────────────────────────────
    "hero.portfolio": "Portfolio",
    "hero.usd": "USD",
    "hero.total_return": "total return",
    "hero.fresh": "Fresh",
    "hero.stale": "Stale",
    "hero.updated": "updated",
    "hero.no_positions": "No positions returned by the API.",

    // ── holdings table ──────────────────────────────────────────────
    "holdings.heading": "Holdings",
    "holdings.col.position": "Position",
    "holdings.col.qty": "Qty",
    "holdings.col.price": "Price",
    "holdings.col.today": "Today",
    "holdings.col.30d": "30d",
    "holdings.col.value_usd": "Value (USD)",
    "holdings.col.total_return": "Total return",
    "holdings.earnings.today": "today",
    "holdings.earnings.in_days": "in {n} days",
    "holdings.earnings.in_day": "in {n} day",
    "holdings.earnings.title": "Earnings {date} · {label}",
    "holdings.earnings.aria": "Earnings {date} ({label})",

    // ── watchlist table ─────────────────────────────────────────────
    "watchlist.heading": "Watchlist",
    "watchlist.symbol_count": "{n} symbols",
    "watchlist.col.position": "Position",
    "watchlist.col.last": "Last",
    "watchlist.col.today": "Today",
    "watchlist.col.30d": "30d",
    "watchlist.col.trend": "Trend",

    // ── digest ──────────────────────────────────────────────────────
    "digest.heading": "Daily digest",
    "digest.subheading": "Four dimensions per holding · observation only",
    "digest.drafting_aria": "Drafting digest…",
    "digest.tile.fundamentals": "Fundamentals",
    "digest.tile.news": "News",
    "digest.tile.sentiment": "Sentiment",
    "digest.tile.technical": "Technical",
    "digest.cached": "cached {time}",
    "digest.fresh": "fresh {time}",
    "digest.refresh": "refresh",
    "digest.no_open_positions": "No open positions today.",
    "digest.quiet_across": "quiet across {initials}",
    "digest.footer_hint":
      "Expand a holding on the portfolio page for a deeper read of what its numbers mean and what to watch.",
    "digest.unavailable": "digest unavailable: {detail}",

    // ── benchmark ───────────────────────────────────────────────────
    "benchmark.heading_lead": "Portfolio vs",
    "benchmark.days_suffix": "{n} days",
    "benchmark.window.30d": "30D",
    "benchmark.window.90d": "90D",
    "benchmark.window.1y": "1Y",
    "benchmark.legend.portfolio": "Portfolio",

    // ── foresight ───────────────────────────────────────────────────
    "foresight.heading_lead": "Next",
    "foresight.days_suffix": "{n} days",
    "foresight.kind.earnings": "earnings",
    "foresight.kind.macro": "macro",
    "foresight.kind.company_event": "event",
    "foresight.days_until.today": "today",
    "foresight.days_until.tomorrow": "tomorrow",
    "foresight.days_until.in_days": "in {n}d",
    "foresight.window.7d": "7D",
    "foresight.window.30d": "30D",
    "foresight.empty": "No scheduled events in the next {n} days.",
    "foresight.try_30d": "Try the 30D view for a wider lookahead.",
    "foresight.covering": "Covering {names}",

    // ── concentration ───────────────────────────────────────────────
    "concentration.heading": "Shape of the book",
    "concentration.top_n": "Top {n}",
    "concentration.holdings": "Holdings",
    "concentration.currency_exposure": "Currency exposure",
    "concentration.largest_position": "Largest position",
    "concentration.aria.position_weights":
      "Position weights stacked by descending share",
    "concentration.aria.currency_exposure": "Currency exposure as USD share",

    // ── insight ─────────────────────────────────────────────────────
    "insight.heading": "What this means",
    "insight.drafting": "Drafting insight…",

    // ── sentiment (Reddit) ──────────────────────────────────────────
    "sentiment.heading": "Reddit discussion · past 7 days",
    "sentiment.bucket.favourable": "favourable",
    "sentiment.bucket.neutral": "neutral",
    "sentiment.bucket.cautious": "cautious",
    "sentiment.aria.posts": "{n} {bucket} posts",
    "sentiment.open_reddit": "open on reddit ↗",
    "sentiment.drafting": "drafting insight…",
    "sentiment.not_enough": "not enough discussion to interpret yet.",
    "sentiment.loading_discussion": "loading discussion…",
    "sentiment.discussion_load_failed":
      "could not load discussion: {detail}",
    "sentiment.no_discussion": "no discussion in the past 7 days.",

    // ── notes ───────────────────────────────────────────────────────
    "notes.heading": "Notes",
    "notes.aria_for": "Notes for {code}",
    "notes.placeholder": "Thesis, triggers, risks…",
    "notes.saving": "saving…",
    "notes.last_saved": "Last saved · {relative}",
    "notes.save_failed": "save failed · {detail}",

    // ── drill-in ────────────────────────────────────────────────────
    "drillin.heading": "Last 90 days",
    "drillin.price_load_failed": "could not load price history: {detail}",
    "drillin.loading_chart": "loading chart…",

    // ── anomaly ─────────────────────────────────────────────────────
    "anomaly.loading": "loading anomalies…",
    "anomaly.load_failed": "could not load anomalies: {detail}",
    "anomaly.none": "no anomalies in the last {n} days.",
    "anomaly.none_in_kind": "none in the last {n} days.",
    "anomaly.kind.technical": "Technical",
    "anomaly.kind.capital": "Capital flow",
  },

  zh: {
    // ── nav / chrome ────────────────────────────────────────────────
    "nav.brand": "静账",
    "nav.home": "首页",
    "nav.portfolio": "投资组合",
    "nav.watchlist": "观察列表",

    "toggle.theme.label": "主题",
    "toggle.theme.aria": "主题：{label}。点击切换。",
    "toggle.locale.aria": "语言：{label}。点击切换。",

    // ── shared / common ─────────────────────────────────────────────
    "common.what": "情况",
    "common.meaning": "意义",
    "common.watch": "关注",
    "common.hide": "[收起]",
    "common.learn_more": "[详解]",
    "common.drafting_commentary": "正在生成解读…",
    "common.commentary_unavailable": "解读暂不可用：{detail}",
    "common.insight_unavailable": "解析暂不可用：{detail}",

    // ── live indicator ──────────────────────────────────────────────
    "live.connecting": "连接中…",
    "live.reconnecting": "重连中…",
    "live.live": "实时",
    "live.live_tick": "实时 · 最近报价 {time} SGT",
    "live.market_closed": "休市 · 下次开市 {when}",
    "live.idle": "闲置",

    // ── time / formatRelative ───────────────────────────────────────
    "time.just_now": "刚刚",
    "time.moments_ago": "片刻前",
    "time.minutes_ago": "{n} 分钟前",
    "time.hours_ago": "{n} 小时前",
    "time.days_ago": "{n} 天前",
    "time.seconds_ago": "{n} 秒前",
    "time.hours_ago_short": "{n} 小时前",

    // ── hero ────────────────────────────────────────────────────────
    "hero.portfolio": "投资组合",
    "hero.usd": "USD",
    "hero.total_return": "总收益",
    "hero.fresh": "最新",
    "hero.stale": "已过时",
    "hero.updated": "更新于",
    "hero.no_positions": "API 未返回任何持仓。",

    // ── holdings table ──────────────────────────────────────────────
    "holdings.heading": "持仓",
    "holdings.col.position": "持仓",
    "holdings.col.qty": "数量",
    "holdings.col.price": "价格",
    "holdings.col.today": "今日",
    "holdings.col.30d": "30 日",
    "holdings.col.value_usd": "市值 (USD)",
    "holdings.col.total_return": "总收益",
    "holdings.earnings.today": "今日",
    "holdings.earnings.in_days": "{n} 天后",
    "holdings.earnings.in_day": "{n} 天后",
    "holdings.earnings.title": "财报 {date} · {label}",
    "holdings.earnings.aria": "财报 {date}（{label}）",

    // ── watchlist table ─────────────────────────────────────────────
    "watchlist.heading": "观察列表",
    "watchlist.symbol_count": "{n} 个标的",
    "watchlist.col.position": "标的",
    "watchlist.col.last": "最新价",
    "watchlist.col.today": "今日",
    "watchlist.col.30d": "30 日",
    "watchlist.col.trend": "走势",

    // ── digest ──────────────────────────────────────────────────────
    "digest.heading": "每日摘要",
    "digest.subheading": "每只持仓四维度 · 仅作观察",
    "digest.drafting_aria": "正在生成摘要…",
    "digest.tile.fundamentals": "基本面",
    "digest.tile.news": "新闻",
    "digest.tile.sentiment": "情绪",
    "digest.tile.technical": "技术",
    "digest.cached": "缓存于 {time}",
    "digest.fresh": "新生成 · {time}",
    "digest.refresh": "刷新",
    "digest.no_open_positions": "今日无开仓。",
    "digest.quiet_across": "{initials} 维度静默",
    "digest.footer_hint":
      "在投资组合页展开任一持仓，可读取其数字含义与值得关注之处。",
    "digest.unavailable": "摘要暂不可用：{detail}",

    // ── benchmark ───────────────────────────────────────────────────
    "benchmark.heading_lead": "组合对比",
    "benchmark.days_suffix": "{n} 天",
    "benchmark.window.30d": "30 日",
    "benchmark.window.90d": "90 日",
    "benchmark.window.1y": "1 年",
    "benchmark.legend.portfolio": "组合",

    // ── foresight ───────────────────────────────────────────────────
    "foresight.heading_lead": "未来",
    "foresight.days_suffix": "{n} 天",
    "foresight.kind.earnings": "财报",
    "foresight.kind.macro": "宏观",
    "foresight.kind.company_event": "事件",
    "foresight.days_until.today": "今日",
    "foresight.days_until.tomorrow": "明日",
    "foresight.days_until.in_days": "{n} 天后",
    "foresight.window.7d": "7 日",
    "foresight.window.30d": "30 日",
    "foresight.empty": "未来 {n} 天内无安排事件。",
    "foresight.try_30d": "可切到 30 日视图查看更长展望。",
    "foresight.covering": "覆盖 {names}",

    // ── concentration ───────────────────────────────────────────────
    "concentration.heading": "组合形态",
    "concentration.top_n": "前 {n}",
    "concentration.holdings": "持仓",
    "concentration.currency_exposure": "币种敞口",
    "concentration.largest_position": "最大单一持仓",
    "concentration.aria.position_weights": "按持仓权重降序堆叠",
    "concentration.aria.currency_exposure": "以 USD 占比表示的币种敞口",

    // ── insight ─────────────────────────────────────────────────────
    "insight.heading": "数字含义",
    "insight.drafting": "正在生成解析…",

    // ── sentiment (Reddit) ──────────────────────────────────────────
    "sentiment.heading": "Reddit 讨论 · 过去 7 天",
    "sentiment.bucket.favourable": "看好",
    "sentiment.bucket.neutral": "中性",
    "sentiment.bucket.cautious": "谨慎",
    "sentiment.aria.posts": "{n} 条{bucket}帖子",
    "sentiment.open_reddit": "在 reddit 打开 ↗",
    "sentiment.drafting": "正在生成解析…",
    "sentiment.not_enough": "讨论量不足以解读。",
    "sentiment.loading_discussion": "讨论加载中…",
    "sentiment.discussion_load_failed": "讨论加载失败：{detail}",
    "sentiment.no_discussion": "过去 7 天无相关讨论。",

    // ── notes ───────────────────────────────────────────────────────
    "notes.heading": "笔记",
    "notes.aria_for": "{code} 的笔记",
    "notes.placeholder": "论点、触发条件、风险…",
    "notes.saving": "保存中…",
    "notes.last_saved": "最近保存 · {relative}",
    "notes.save_failed": "保存失败 · {detail}",

    // ── drill-in ────────────────────────────────────────────────────
    "drillin.heading": "近 90 天",
    "drillin.price_load_failed": "价格历史加载失败：{detail}",
    "drillin.loading_chart": "图表加载中…",

    // ── anomaly ─────────────────────────────────────────────────────
    "anomaly.loading": "异动加载中…",
    "anomaly.load_failed": "异动加载失败：{detail}",
    "anomaly.none": "近 {n} 天内无异动。",
    "anomaly.none_in_kind": "近 {n} 天内无相关异动。",
    "anomaly.kind.technical": "技术",
    "anomaly.kind.capital": "资金流",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type StringKey = keyof (typeof STRINGS)["en"];

// UI string registry. Flat keys, dot-namespaced.
//
// PR 1 ships only nav + toggle keys so the locale infra can be exercised
// end-to-end. PR 2 adds the rest of the component sweep (~110 strings).
//
// Translations marked "v1 — review pass needed". Quiet/precise/considered
// register per PRODUCT.md — no exclamation marks, no marketing tone.

import type { Locale } from "./locale-provider";

export const STRINGS = {
  en: {
    "nav.brand": "quiet ledger",
    "nav.home": "home",
    "nav.portfolio": "portfolio",
    "nav.watchlist": "watchlist",
    "toggle.theme.label": "theme",
    "toggle.theme.aria": "Theme: {label}. Click to cycle.",
    "toggle.locale.aria": "Language: {label}. Click to toggle.",
  },
  zh: {
    "nav.brand": "静账",
    "nav.home": "首页",
    "nav.portfolio": "投资组合",
    "nav.watchlist": "观察列表",
    "toggle.theme.label": "主题",
    "toggle.theme.aria": "主题：{label}。点击切换。",
    "toggle.locale.aria": "语言：{label}。点击切换。",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type StringKey = keyof (typeof STRINGS)["en"];

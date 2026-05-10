"use client";

import { useCallback } from "react";
import { useLocale } from "./locale-provider";
import { STRINGS, type StringKey } from "./strings";

const warnedKeys = new Set<string>();

export function useT() {
  const { locale } = useLocale();

  return useCallback(
    (key: StringKey, params?: Record<string, string | number>): string => {
      const table = STRINGS[locale] as Record<string, string>;
      let s = table[key];
      if (s === undefined) {
        if (process.env.NODE_ENV !== "production" && !warnedKeys.has(key)) {
          // eslint-disable-next-line no-console
          console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
          warnedKeys.add(key);
        }
        s = (STRINGS.en as Record<string, string>)[key] ?? key;
      }
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(`{${k}}`, String(v));
        }
      }
      return s;
    },
    [locale],
  );
}

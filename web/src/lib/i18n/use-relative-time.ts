"use client";

import { useCallback } from "react";
import { useLocale } from "./locale-provider";
import { useT } from "./use-t";

// Coarse buckets — used by Hero ("updated 5 hr ago") and DailyDigest
// ("cached 2 hr ago"). Mirrors the previous `timeSince()` shape.
export function useTimeSince() {
  const t = useT();
  return useCallback(
    (iso: string): string => {
      const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (seconds < 5) return t("time.just_now");
      if (seconds < 60) return t("time.moments_ago");
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return t("time.minutes_ago", { n: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t("time.hours_ago", { n: hours });
      const days = Math.floor(hours / 24);
      return t("time.days_ago", { n: days });
    },
    [t],
  );
}

// Fine buckets — used by NotesBlock ("Last saved · 12s ago"). Falls
// back to a locale-aware absolute timestamp once over 24 hours.
export function useFormatRelative() {
  const t = useT();
  const { locale } = useLocale();
  return useCallback(
    (then: Date): string => {
      const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
      if (seconds < 5) return t("time.just_now");
      if (seconds < 60) return t("time.seconds_ago", { n: seconds });
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return t("time.minutes_ago", { n: minutes });
      const hours = Math.round(minutes / 60);
      if (hours < 24) return t("time.hours_ago_short", { n: hours });
      return then.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
    },
    [t, locale],
  );
}

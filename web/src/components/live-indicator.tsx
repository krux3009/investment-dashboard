// Footer indicator: a single quiet line per page reporting the SSE
// stream state. Three states:
//   • live              — connected and last tick within ~30s
//   • market-closed     — connected, no ticks (out of US RTH)
//   • disconnected      — EventSource lost (auto-reconnect happens)

"use client";

import { useEffect, useState } from "react";
import { useLiveConnected, useLiveMarket } from "@/lib/live-store";
import { useT } from "@/lib/i18n/use-t";

const SGT_FMT = new Intl.DateTimeFormat("en-SG", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Singapore",
});

const SGT_HHMM = new Intl.DateTimeFormat("en-SG", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Singapore",
});

const SGT_DATE = new Intl.DateTimeFormat("en-SG", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Asia/Singapore",
});


export function LiveIndicator() {
  const t = useT();
  const connected = useLiveConnected();
  const { market, lastTickAt, nextOpenIso } = useLiveMarket();

  // Force re-render every 5s so the "X seconds ago" label freshens
  // even when ticks are not arriving (out of RTH).
  const [, forceRefresh] = useState(0);
  useEffect(() => {
    const tick = window.setInterval(() => forceRefresh((n) => n + 1), 5000);
    return () => window.clearInterval(tick);
  }, []);

  const dotClass = connected
    ? market === "open"
      ? "bg-accent"
      : "bg-quiet/60"
    : "bg-loss/60";

  const label = (() => {
    if (!connected) {
      return lastTickAt === null ? t("live.connecting") : t("live.reconnecting");
    }
    if (market === "open" && lastTickAt) {
      const tickDate = new Date(lastTickAt * 1000);
      return t("live.live_tick", { time: SGT_FMT.format(tickDate) });
    }
    if (market === "closed" && nextOpenIso) {
      const next = new Date(nextOpenIso);
      const sameDay = SGT_DATE.format(new Date()) === SGT_DATE.format(next);
      const when = sameDay
        ? `${SGT_HHMM.format(next)} SGT`
        : `${SGT_DATE.format(next)} · ${SGT_HHMM.format(next)} SGT`;
      return t("live.market_closed", { when });
    }
    if (market === "open") return t("live.live");
    return t("live.idle");
  })();

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-12 pt-4 border-t border-rule text-xs text-whisper tabular flex items-center gap-2"
    >
      <span
        aria-hidden
        className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`}
      />
      <span>{label}</span>
    </div>
  );
}

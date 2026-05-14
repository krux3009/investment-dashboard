"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ForesightEvent, ForesightResponse } from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";

interface Props {
  initial: ForesightResponse;
  year: number;
  month: number; // 1-12
}

const WEEKDAY_KEYS = [
  "calendar.weekday.sun",
  "calendar.weekday.mon",
  "calendar.weekday.tue",
  "calendar.weekday.wed",
  "calendar.weekday.thu",
  "calendar.weekday.fri",
  "calendar.weekday.sat",
] as const;

const MAX_EVENTS_PER_CELL = 4;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function adjacentMonth(year: number, month: number, dir: -1 | 1) {
  const m = month + dir;
  if (m < 1) return { year: year - 1, month: 12 };
  if (m > 12) return { year: year + 1, month: 1 };
  return { year, month: m };
}

function todayParts() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

// 12px calendar SVG glyph — copied from holdings-table.tsx:145-160 so
// the calendar view doesn't depend on holdings-table's i18n wrapper.
function EarningsGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <rect x="2.5" y="3.5" width="11" height="10" rx="1" />
      <line x1="2.5" y1="6.5" x2="13.5" y2="6.5" />
      <line x1="5.5" y1="2" x2="5.5" y2="4.5" />
      <line x1="10.5" y1="2" x2="10.5" y2="4.5" />
    </svg>
  );
}

function EventRow({ ev }: { ev: ForesightEvent }) {
  if (ev.kind === "earnings") {
    return (
      <div className="flex items-center gap-1 text-xs text-ink tabular leading-tight">
        <EarningsGlyph />
        <span className="truncate">{ev.ticker ?? ev.label}</span>
      </div>
    );
  }
  if (ev.kind === "macro") {
    return (
      <div className="font-mono text-[11px] tracking-wider text-quiet uppercase leading-tight truncate">
        {ev.label}
      </div>
    );
  }
  // company_event
  return (
    <div className="flex items-center gap-1 text-xs text-quiet leading-tight">
      <span aria-hidden>·</span>
      <span className="truncate">
        {ev.ticker ? `${ev.ticker} ` : ""}
        {ev.label}
      </span>
    </div>
  );
}

export function CalendarView({ initial, year, month }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const today = todayParts();
  const isThisMonth = today.year === year && today.month === month;

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat(
      locale === "zh" ? "zh-CN" : "en-US",
      { month: "long", year: "numeric" },
    ).format(new Date(year, month - 1, 1));
  }, [locale, year, month]);

  // Group events by ISO date (yyyy-mm-dd).
  const eventsByDate = useMemo(() => {
    const map = new Map<string, ForesightEvent[]>();
    for (const e of initial.events) {
      const arr = map.get(e.date);
      if (arr) arr.push(e);
      else map.set(e.date, [e]);
    }
    return map;
  }, [initial.events]);

  // Build 42 cells starting from the Sunday on or before the 1st.
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startSunday = new Date(first);
    startSunday.setDate(first.getDate() - first.getDay());
    const out: { y: number; m: number; d: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const cur = new Date(startSunday);
      cur.setDate(startSunday.getDate() + i);
      const y = cur.getFullYear();
      const m = cur.getMonth() + 1;
      const d = cur.getDate();
      out.push({ y, m, d, inMonth: m === month && y === year });
    }
    return out;
  }, [year, month]);

  const prev = adjacentMonth(year, month, -1);
  const next = adjacentMonth(year, month, 1);
  const prevHref = `/portfolio?tab=calendar&month=${prev.year}-${pad2(prev.month)}`;
  const nextHref = `/portfolio?tab=calendar&month=${next.year}-${pad2(next.month)}`;

  // Horizon footnote: how far past today is the visible month?
  const monthStart = new Date(year, month - 1, 1);
  const now = new Date(today.year, today.month - 1, today.day);
  const daysToMonthStart =
    (monthStart.getTime() - now.getTime()) / 86_400_000;
  const showHorizonNote = daysToMonthStart > 60;

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs uppercase tracking-[0.06em] text-quiet">
          <span className="text-ink">{monthLabel}</span>
        </h2>
        <div className="flex gap-1 text-xs">
          <Link
            href={prevHref}
            className="px-2 py-1 rounded-sm tabular text-quiet hover:text-ink border border-transparent"
            aria-label={t("calendar.prev")}
          >
            ‹ {t("calendar.prev")}
          </Link>
          <Link
            href={nextHref}
            className="px-2 py-1 rounded-sm tabular text-quiet hover:text-ink border border-transparent"
            aria-label={t("calendar.next")}
          >
            {t("calendar.next")} ›
          </Link>
        </div>
      </div>

      <div
        className="grid grid-cols-7 pb-2"
        role="presentation"
      >
        {WEEKDAY_KEYS.map((k) => (
          <div
            key={k}
            className="text-xs uppercase tracking-[0.06em] text-quiet text-center"
          >
            {t(k)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          const iso = isoDate(c.y, c.m, c.d);
          const evs = c.inMonth ? eventsByDate.get(iso) ?? [] : [];
          const isToday =
            isThisMonth && c.inMonth && c.d === today.day;
          const visible = evs.slice(0, MAX_EVENTS_PER_CELL);
          const overflow = evs.length - visible.length;

          return (
            <div
              key={i}
              className={`border border-rule -mt-px -ml-px min-h-[88px] p-2 ${
                isToday ? "ring-1 ring-rule ring-inset" : ""
              }`}
            >
              {c.inMonth && (
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-quiet text-xs tabular">{c.d}</span>
                  {isToday && (
                    <span className="text-[10px] uppercase tracking-wider text-whisper">
                      {t("calendar.today_cap")}
                    </span>
                  )}
                </div>
              )}
              {c.inMonth &&
                visible.map((ev) => (
                  <div key={ev.event_id} className="mt-1">
                    <EventRow ev={ev} />
                  </div>
                ))}
              {c.inMonth && overflow > 0 && (
                <div className="mt-1 text-xs text-quiet leading-tight">
                  {t("calendar.more", { n: overflow })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showHorizonNote && (
        <p className="text-xs text-whisper mt-4 italic">
          {t("calendar.horizon_note")}
        </p>
      )}
    </section>
  );
}

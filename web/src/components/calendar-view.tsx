"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchForesightInsight,
  type DailyPnlEntry,
  type DailyPnlResponse,
  type ForesightEvent,
  type ForesightResponse,
} from "@/lib/api";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";
import { useLiveMarket, useLiveTotals } from "@/lib/live-store";
import {
  ForesightInsightBody,
  type InsightState,
} from "@/components/foresight-insight-body";
import type { StringKey } from "@/lib/i18n/strings";

interface Props {
  initial: ForesightResponse;
  dailyPnl?: DailyPnlResponse;
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

const KIND_LABEL_KEY: Record<ForesightEvent["kind"], StringKey> = {
  earnings: "foresight.kind.earnings",
  macro: "foresight.kind.macro",
  company_event: "foresight.kind.company_event",
  exdiv: "foresight.kind.exdiv",
};

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

function formatDate(iso: string, locale: "en" | "zh"): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(
    locale === "zh" ? "zh-CN" : "en-US",
    { weekday: "short", month: "short", day: "numeric" },
  );
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

function formatSignedUsd(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function formatSignedPct(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${Math.abs(n * 100).toFixed(2)}%`;
}

function PnlRow({
  pnl,
  pct,
  dim,
  isLive,
}: {
  pnl: number;
  pct: number;
  dim: boolean;
  isLive: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between text-[11px] tabular font-mono leading-tight mb-1 ${
        dim ? "opacity-45" : ""
      }`}
      aria-label={isLive ? "running daily P&L" : "daily P&L"}
    >
      <span className="text-ink">{formatSignedUsd(pnl)}</span>
      <span className="text-quiet">{formatSignedPct(pct)}</span>
    </div>
  );
}

function EventRowContent({ ev }: { ev: ForesightEvent }) {
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
  if (ev.kind === "exdiv") {
    return (
      <div className="flex items-center gap-1 text-xs text-ink tabular leading-tight">
        <span
          aria-hidden
          className="text-quiet font-serif italic text-sm leading-none shrink-0"
        >
          ƒ
        </span>
        <span className="truncate">{ev.ticker ?? ev.label}</span>
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

interface EventRowProps {
  ev: ForesightEvent;
  selected: boolean;
  onSelect: (eventId: string) => void;
  label: string;
}

function EventRow({ ev, selected, onSelect, label }: EventRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(ev.event_id)}
      aria-pressed={selected}
      aria-label={label}
      className={`block w-full text-left rounded-sm px-0.5 -mx-0.5 mt-1 cursor-pointer transition-colors ${
        selected
          ? "bg-surface-expanded"
          : "hover:bg-surface-hover"
      }`}
    >
      <EventRowContent ev={ev} />
    </button>
  );
}

interface AgendaListProps {
  days: { iso: string; day: number; evs: ForesightEvent[]; isToday: boolean }[];
  computePnl: (iso: string) => { pnl: number; pct: number; isLive: boolean } | null;
  selectedId: string | null;
  onSelect: (eventId: string) => void;
}

// Mobile agenda: one row per signal-carrying day, in date order. Reuses the
// same EventRow chips + PnlRow + tap-to-open selection as the desktop grid;
// no MAX_EVENTS cap since the list has vertical room to spare.
function AgendaList({ days, computePnl, selectedId, onSelect }: AgendaListProps) {
  const t = useT();
  const { locale } = useLocale();

  if (days.length === 0) {
    return (
      <div className="md:hidden py-8 text-center text-xs text-quiet">
        {t("calendar.agenda.empty")}
      </div>
    );
  }

  return (
    <div className="md:hidden flex flex-col">
      {days.map((row) => {
        const pnl = computePnl(row.iso);
        return (
          <div
            key={row.iso}
            className={`py-3 border-b border-rule/60 last:border-b-0 ${
              row.isToday ? "-mx-2 px-2 rounded-md ring-1 ring-rule ring-inset" : ""
            }`}
          >
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm text-ink tabular">
                {formatDate(row.iso, locale)}
              </span>
              {row.isToday && (
                <span className="text-[10px] uppercase tracking-wider text-whisper">
                  {t("calendar.today_cap")}
                </span>
              )}
            </div>
            {pnl && (
              <PnlRow pnl={pnl.pnl} pct={pnl.pct} dim={false} isLive={pnl.isLive} />
            )}
            <div className="flex flex-col gap-0.5">
              {row.evs.map((ev) => (
                <EventRow
                  key={ev.event_id}
                  ev={ev}
                  selected={ev.event_id === selectedId}
                  onSelect={onSelect}
                  label={t("calendar.select_event", {
                    date: formatDate(ev.date, locale),
                    kind: t(KIND_LABEL_KEY[ev.kind]),
                    label: ev.label,
                  })}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarView({ initial, dailyPnl, year, month }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const today = todayParts();
  const todayIso = isoDate(today.year, today.month, today.day);
  const isThisMonth = today.year === year && today.month === month;
  const liveTotals = useLiveTotals();
  const { market } = useLiveMarket();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insightById, setInsightById] = useState<
    Record<string, InsightState>
  >({});
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  const pnlByDate = useMemo(() => {
    const map = new Map<string, DailyPnlEntry>();
    if (dailyPnl) {
      for (const e of dailyPnl.entries) map.set(e.date, e);
    }
    return map;
  }, [dailyPnl]);

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

  // Per-day P&L resolver shared by the desktop grid + the mobile agenda:
  // today (live, while market open) > a past day's recorded entry > none.
  const computePnl = useCallback(
    (iso: string): { pnl: number; pct: number; isLive: boolean } | null => {
      if (iso === todayIso && liveTotals && market === "open") {
        return {
          pnl: liveTotals.total_today_change_abs_usd,
          pct: liveTotals.total_today_change_pct,
          isLive: true,
        };
      }
      const entry = pnlByDate.get(iso);
      if (iso < todayIso && entry) {
        return { pnl: entry.pnl_usd, pct: entry.pnl_pct, isLive: false };
      }
      return null;
    },
    [todayIso, liveTotals, market, pnlByDate],
  );

  // Mobile agenda: a chronological list of the visible month's days that
  // carry signal — any day with events, plus today, plus past days with a
  // recorded P&L. A month grid is inherently 7 columns wide; below md we
  // swap it for this list rather than crush 7 cells into 390px.
  const agendaDays = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const out: {
      iso: string;
      day: number;
      evs: ForesightEvent[];
      isToday: boolean;
    }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoDate(year, month, d);
      const evs = eventsByDate.get(iso) ?? [];
      const isToday = iso === todayIso;
      const hasPnl = computePnl(iso) !== null;
      if (evs.length === 0 && !isToday && !hasPnl) continue;
      out.push({ iso, day: d, evs, isToday });
    }
    return out;
  }, [year, month, eventsByDate, todayIso, computePnl]);

  const selected = useMemo(
    () => initial.events.find((e) => e.event_id === selectedId) ?? null,
    [initial.events, selectedId],
  );

  const load = useCallback(
    async (eventId: string) => {
      setInsightById((s) => ({ ...s, [eventId]: { kind: "loading" } }));
      const result = await fetchForesightInsight(
        eventId,
        initial.days,
        false,
        locale,
      );
      setInsightById((s) => ({
        ...s,
        [eventId]: result.ok
          ? { kind: "ready", data: result.data }
          : result.status === 503
            ? { kind: "unavailable", detail: result.detail }
            : { kind: "error", detail: result.detail },
      }));
    },
    [initial.days, locale],
  );

  const handleSelect = useCallback(
    (eventId: string) => {
      setSelectedId((cur) => (cur === eventId ? null : eventId));
      if (!insightById[eventId]) void load(eventId);
    },
    [insightById, load],
  );

  // ESC clears selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scroll panel into view when a fresh selection is made.
  useEffect(() => {
    if (selectedId && panelRef.current) {
      panelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedId]);

  // Locale flip wipes cached prose so next select fetches fresh language.
  useEffect(() => {
    setInsightById({});
  }, [locale]);

  // Month change clears selection (event ids belong to current fetch).
  useEffect(() => {
    setSelectedId(null);
  }, [year, month]);

  const prev = adjacentMonth(year, month, -1);
  const next = adjacentMonth(year, month, 1);
  const prevHref = `/portfolio?tab=calendar&month=${prev.year}-${pad2(prev.month)}`;
  const nextHref = `/portfolio?tab=calendar&month=${next.year}-${pad2(next.month)}`;

  // Horizon footnote: signals the yfinance earnings ceiling (~90d), not the
  // route's window. Show when the visible month is >60d out AND no earnings
  // event lands inside it — i.e. macro shows up but earnings don't.
  const monthStart = new Date(year, month - 1, 1);
  const now = new Date(today.year, today.month - 1, today.day);
  const daysToMonthStart =
    (monthStart.getTime() - now.getTime()) / 86_400_000;
  const hasInMonthEarnings = useMemo(() => {
    const ym = `${year}-${pad2(month)}-`;
    return initial.events.some(
      (e) => e.kind === "earnings" && e.date.startsWith(ym),
    );
  }, [initial.events, year, month]);
  const showHorizonNote = daysToMonthStart > 60 && !hasInMonthEarnings;

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs uppercase tracking-[0.06em] text-quiet">
          <span className="text-ink">{monthLabel}</span>
        </h2>
        <div className="flex gap-1 text-xs">
          <Link
            href={prevHref}
            prefetch
            className="px-2 py-1 rounded-sm tabular text-quiet hover:text-ink border border-transparent"
            aria-label={t("calendar.prev")}
          >
            ‹ {t("calendar.prev")}
          </Link>
          <Link
            href={nextHref}
            prefetch
            className="px-2 py-1 rounded-sm tabular text-quiet hover:text-ink border border-transparent"
            aria-label={t("calendar.next")}
          >
            {t("calendar.next")} ›
          </Link>
        </div>
      </div>

      {/* Mobile (below md): chronological agenda list. */}
      <AgendaList
        days={agendaDays}
        computePnl={computePnl}
        selectedId={selectedId}
        onSelect={handleSelect}
      />

      {/* Desktop (md+): the month grid. */}
      <div
        className="hidden md:grid grid-cols-7 pb-2"
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

      <div className="hidden md:grid grid-cols-7">
        {cells.map((c, i) => {
          const iso = isoDate(c.y, c.m, c.d);
          const evs = eventsByDate.get(iso) ?? [];
          const cellIsToday = iso === todayIso;
          const pnlForCell = computePnl(iso);
          const isToday = cellIsToday;
          const visible = evs.slice(0, MAX_EVENTS_PER_CELL);
          const overflow = evs.length - visible.length;
          const trailingPrefix = c.inMonth
            ? ""
            : c.y > year || (c.y === year && c.m > month)
              ? t("calendar.next_month_prefix") + " "
              : t("calendar.prev_month_prefix") + " ";

          return (
            <div
              key={i}
              className={`border border-rule -mt-px -ml-px min-h-[104px] p-2 ${
                isToday ? "ring-1 ring-rule ring-inset" : ""
              }`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span
                  className={`text-xs tabular ${
                    c.inMonth ? "text-quiet" : "text-whisper opacity-60"
                  }`}
                >
                  {c.d}
                </span>
                {isToday && (
                  <span className="text-[10px] uppercase tracking-wider text-whisper">
                    {t("calendar.today_cap")}
                  </span>
                )}
              </div>
              {pnlForCell && (
                <PnlRow
                  pnl={pnlForCell.pnl}
                  pct={pnlForCell.pct}
                  dim={!c.inMonth}
                  isLive={pnlForCell.isLive}
                />
              )}
              {visible.map((ev) => (
                <div key={ev.event_id} className={c.inMonth ? "" : "opacity-45"}>
                  <EventRow
                    ev={ev}
                    selected={ev.event_id === selectedId}
                    onSelect={handleSelect}
                    label={trailingPrefix + t("calendar.select_event", {
                      date: formatDate(ev.date, locale),
                      kind: t(KIND_LABEL_KEY[ev.kind]),
                      label: ev.label,
                    })}
                  />
                </div>
              ))}
              {overflow > 0 && (
                <div
                  className={`mt-1 text-xs leading-tight ${
                    c.inMonth ? "text-quiet" : "text-whisper opacity-60"
                  }`}
                >
                  {t("calendar.more", { n: overflow })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div
          ref={panelRef}
          className="mt-6 border-t border-rule pt-4"
          role="region"
          aria-label={t("calendar.insight_region")}
        >
          <div className="flex items-baseline justify-between mb-3 gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-baseline gap-3 flex-wrap text-xs tabular">
                <span className="text-ink">
                  {formatDate(selected.date, locale)}
                </span>
                <span className="uppercase tracking-[0.06em] text-quiet">
                  {t(KIND_LABEL_KEY[selected.kind])}
                </span>
                {selected.ticker && (
                  <span className="font-mono text-[11px] text-ink">
                    {selected.ticker}
                  </span>
                )}
              </div>
              <div className="text-sm text-ink">{selected.label}</div>
              <div className="text-xs text-quiet leading-[1.5] max-w-[60ch]">
                {selected.description}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-xs text-quiet hover:text-ink whitespace-nowrap shrink-0"
              aria-label={t("common.hide")}
            >
              {t("common.hide")}
            </button>
          </div>
          <ForesightInsightBody insight={insightById[selected.event_id]} />
        </div>
      )}

      {showHorizonNote && (
        <p className="text-xs text-whisper mt-4 italic">
          {t("calendar.horizon_note")}
        </p>
      )}
    </section>
  );
}

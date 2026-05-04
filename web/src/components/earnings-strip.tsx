"use client";

// Plain-English earnings strip. Lists upcoming reports for held
// positions as a vertical stack so each row has space for an inline
// estimate sentence in everyday words. Clicking [learn more] expands a
// Claude-generated What/Meaning/Watch block specific to that report,
// lazy-fetched from /api/earnings-insight/{code} and cached per session.

import { useState } from "react";
import {
  fetchEarningsInsight,
  type EarningsInsightResponse,
  type EarningsItem,
} from "@/lib/api";

interface Props {
  items: EarningsItem[];
}

const FULL_DATE = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
});

function fmtDate(iso: string): string {
  return FULL_DATE.format(new Date(iso));
}

function fmtMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  return `${sign}$${abs.toFixed(2)}`;
}

function buildEstimateSentence(it: EarningsItem): string | null {
  const eps = it.eps_avg;
  const rev = it.revenue_avg;
  if (eps === null && rev === null) return null;

  const parts: string[] = [];
  if (eps !== null) {
    if (eps >= 0) {
      parts.push(`Analysts expect about ${fmtMoney(eps)} profit per share`);
    } else {
      parts.push(
        `Analysts expect a small loss of about ${fmtMoney(Math.abs(eps))} per share`,
      );
    }
  }
  if (rev !== null) {
    const lead = parts.length > 0 ? "and about" : "Analysts expect about";
    parts.push(`${lead} ${fmtMoney(rev)} in total sales`);
  }
  return parts.join(" ") + ".";
}

function buildDateLine(it: EarningsItem): string {
  const date = fmtDate(it.date);
  if (it.days_until === 0) return `${it.ticker} reports ${date} (today)`;
  if (it.days_until === 1) return `${it.ticker} reports ${date} (tomorrow)`;
  return `${it.ticker} reports ${date} (in ${it.days_until} days)`;
}

type InsightState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: EarningsInsightResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

export function EarningsStrip({ items }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [insightByCode, setInsightByCode] = useState<Record<string, InsightState>>({});

  if (items.length === 0) return null;

  async function toggle(code: string) {
    const isOpening = !expanded[code];
    setExpanded((prev) => ({ ...prev, [code]: !prev[code] }));
    if (!isOpening) return;
    if (insightByCode[code]?.kind === "ready") return;
    setInsightByCode((prev) => ({ ...prev, [code]: { kind: "loading" } }));
    const result = await fetchEarningsInsight(code, false);
    setInsightByCode((prev) => ({
      ...prev,
      [code]: result.ok
        ? { kind: "ready", data: result.data }
        : result.status === 503
          ? { kind: "unavailable", detail: result.detail }
          : { kind: "error", detail: result.detail },
    }));
  }

  return (
    <section className="mb-8 -mt-2">
      <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-1.5">
        Upcoming earnings
      </div>
      <p className="text-sm text-whisper italic mb-5 max-w-[60ch]">
        A quarterly check-in where each company shares how much money
        it earned and sold over the last three months.
      </p>
      <ul className="flex flex-col gap-5 max-w-[68ch]">
        {items.map((it) => {
          const close = it.days_until <= 14;
          const isOpen = !!expanded[it.code];
          const estimate = buildEstimateSentence(it);
          const insight = insightByCode[it.code];
          return (
            <li key={it.code}>
              <div className={close ? "text-ink" : "text-quiet"}>
                <div className="text-[15px]">
                  <span className="font-mono text-xs uppercase tracking-[0.08em] mr-1.5">
                    {it.ticker}
                  </span>
                  <span className="text-[15px]">
                    reports {fmtDate(it.date)}
                  </span>
                  <span className="text-[13px] text-whisper ml-1.5">
                    ({it.days_until === 0
                      ? "today"
                      : it.days_until === 1
                        ? "tomorrow"
                        : `in ${it.days_until} days`})
                  </span>
                </div>
                {estimate && (
                  <p className="text-sm text-quiet leading-[1.65] mt-1">
                    {estimate}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void toggle(it.code)}
                  aria-expanded={isOpen}
                  className="text-xs text-quiet underline-offset-4 hover:underline mt-1.5"
                >
                  {isOpen ? "hide details" : "learn more"}
                </button>
              </div>

              {isOpen && (
                <div className="mt-3 pl-4 border-l border-rule/60">
                  {insight?.kind === "loading" && (
                    <div className="text-sm text-quiet italic">
                      drafting explanation…
                    </div>
                  )}
                  {insight?.kind === "unavailable" && (
                    <div className="text-sm text-whisper italic">
                      {insight.detail}
                    </div>
                  )}
                  {insight?.kind === "error" && (
                    <div className="text-sm text-loss">
                      explanation unavailable: {insight.detail}
                    </div>
                  )}
                  {insight?.kind === "ready" && (
                    <dl className="flex flex-col gap-2.5 text-sm leading-[1.65]">
                      {insight.data.what && (
                        <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                          <dt className="text-xs uppercase tracking-wide text-quiet">
                            What
                          </dt>
                          <dd className="text-ink">{insight.data.what}</dd>
                        </div>
                      )}
                      {insight.data.meaning && (
                        <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                          <dt className="text-xs uppercase tracking-wide text-quiet">
                            Meaning
                          </dt>
                          <dd className="text-ink">{insight.data.meaning}</dd>
                        </div>
                      )}
                      {insight.data.watch && (
                        <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                          <dt className="text-xs uppercase tracking-wide text-quiet">
                            Watch
                          </dt>
                          <dd className="text-ink">{insight.data.watch}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

import { Fragment, useEffect, useState } from "react";
import {
  fetchDividendForCode,
  fetchDividendsInsight,
  type DividendsInsightResponse,
  type DividendsResponse,
  type HoldingDividend,
} from "@/lib/api";
import { fmtCurrency, fmtUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/use-t";
import { useLocale } from "@/lib/i18n/locale-provider";

interface Props {
  initial: DividendsResponse;
}

type InsightState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: DividendsInsightResponse }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string };

type HistoryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: HoldingDividend }
  | { kind: "error"; detail: string };

const SLICE_VARS = [
  "var(--slice-1)",
  "var(--slice-2)",
  "var(--slice-3)",
  "var(--slice-4)",
  "var(--slice-5)",
  "var(--slice-6)",
];

const BAR_W = 600;
const BAR_H = 16;

interface Segment {
  label: string;
  pct: number;
  usd: number;
}

function StackedBar({
  segments,
  ariaLabel,
}: {
  segments: Segment[];
  ariaLabel: string;
}) {
  let cursor = 0;
  return (
    <svg
      viewBox={`0 0 ${BAR_W} ${BAR_H}`}
      width="100%"
      height={BAR_H}
      role="img"
      aria-label={ariaLabel}
      className="block"
    >
      {segments.map((seg, i) => {
        const w = seg.pct * BAR_W;
        const x = cursor;
        cursor += w;
        return (
          <rect
            key={`${seg.label}-${i}`}
            x={x}
            y={0}
            width={Math.max(w, 0.5)}
            height={BAR_H}
            fill={SLICE_VARS[i % SLICE_VARS.length]}
            stroke="var(--surface)"
            strokeWidth={0.75}
          >
            <title>{`${seg.label} · ${fmtUsd(seg.usd, { decimals: 2 })}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function formatExDate(iso: string | null, locale: "en" | "zh"): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DividendLedgerBlock({ initial }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [tableOpen, setTableOpen] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [historyByCode, setHistoryByCode] = useState<
    Record<string, HistoryState>
  >({});
  const [insightOpen, setInsightOpen] = useState(false);
  const [insight, setInsight] = useState<InsightState>({ kind: "idle" });

  useEffect(() => {
    if (!insightOpen) return;
    let cancelled = false;
    setInsight({ kind: "loading" });
    (async () => {
      const result = await fetchDividendsInsight(false, locale);
      if (cancelled) return;
      if (result.ok) {
        setInsight({ kind: "ready", data: result.data });
      } else if (result.status === 404) {
        setInsight({
          kind: "unavailable",
          detail: t("dividends.summary.no_history"),
        });
      } else if (result.status === 503) {
        setInsight({ kind: "unavailable", detail: result.detail });
      } else {
        setInsight({ kind: "error", detail: result.detail });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [insightOpen, locale, t]);

  // Build the stacked-bar segments from holdings that contributed
  // TTM income. Order: descending USD. Tickers with 0 don't appear.
  const totalTtm = initial.totals.ttm_total_usd;
  const segments: Segment[] =
    totalTtm > 0
      ? initial.items
          .filter((i) => i.ttm_total_usd > 0)
          .sort((a, b) => b.ttm_total_usd - a.ttm_total_usd)
          .map((i) => ({
            label: i.ticker,
            pct: i.ttm_total_usd / totalTtm,
            usd: i.ttm_total_usd,
          }))
      : [];

  // Find the upcoming-soonest ex-date across all items, for the
  // summary line. Returns the holding + its ISO date.
  const nextSoon = (() => {
    let pick: { item: HoldingDividend; iso: string } | null = null;
    for (const i of initial.items) {
      if (!i.next_ex_date) continue;
      if (!pick || i.next_ex_date < pick.iso) {
        pick = { item: i, iso: i.next_ex_date };
      }
    }
    return pick;
  })();

  const hasReit = initial.items.some((i) => i.is_reit);

  // ── per-row history fetch on expand ────────────────────────────
  function toggleRow(code: string) {
    setExpandedCode((prev) => (prev === code ? null : code));
    if (historyByCode[code]?.kind === "ready") return;
    setHistoryByCode((prev) => ({ ...prev, [code]: { kind: "loading" } }));
    (async () => {
      const result = await fetchDividendForCode(code);
      setHistoryByCode((prev) => ({
        ...prev,
        [code]: result.ok
          ? { kind: "ready", data: result.data }
          : { kind: "error", detail: result.detail },
      }));
    })();
  }

  // Render even when totalTtm is 0 — the surface is observational and
  // "no distributions on record this year" is a useful read.
  return (
    <section className="my-12">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs uppercase tracking-[0.06em] text-quiet">
          {t("dividends.heading")}
        </h2>
        <button
          type="button"
          onClick={() => setInsightOpen((v) => !v)}
          className="text-xs text-quiet hover:text-ink"
        >
          {insightOpen ? t("common.hide") : t("common.learn_more")}
        </button>
      </div>

      <div className="text-sm text-ink mb-4 leading-[1.6]">
        {totalTtm > 0 ? (
          <span>
            {t("dividends.summary.ttm", {
              amount: fmtUsd(totalTtm, { decimals: 2 }),
            })}
          </span>
        ) : (
          <span className="text-quiet">
            {t("dividends.summary.no_history")}
          </span>
        )}{" "}
        {nextSoon ? (
          <span className="text-quiet">
            ·{" "}
            {t("dividends.summary.next", {
              date: formatExDate(nextSoon.iso, locale),
              ticker: nextSoon.item.ticker,
              amount: nextSoon.item.next_amount_total_usd
                ? fmtUsd(nextSoon.item.next_amount_total_usd, { decimals: 2 })
                : "—",
            })}
          </span>
        ) : (
          <span className="text-quiet">
            · {t("dividends.summary.none_next")}
          </span>
        )}
      </div>

      {segments.length > 0 && (
        <>
          <StackedBar
            segments={segments}
            ariaLabel={t("dividends.aria.bar")}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular text-quiet mt-2">
            {segments.map((s) => (
              <span key={s.label} className="inline-flex items-baseline gap-1.5">
                <span className="text-ink">{s.label}</span>
                <span>{(s.pct * 100).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setTableOpen((v) => !v)}
          className="text-xs text-quiet hover:text-ink"
        >
          {tableOpen
            ? t("dividends.hide_table")
            : t("dividends.show_table")}
        </button>
      </div>

      {tableOpen && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-rule">
                <th className="text-left pb-2 pr-3 text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                  {t("dividends.col.position")}
                </th>
                <th className="text-left pb-2 px-3 text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                  {t("dividends.col.ccy")}
                </th>
                <th className="text-right pb-2 px-3 text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                  {t("dividends.col.last_ex")}
                </th>
                <th className="text-right pb-2 px-3 text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                  {t("dividends.col.last_amount")}
                </th>
                <th className="text-right pb-2 px-3 text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                  {t("dividends.col.ttm_per_share")}
                </th>
                <th className="text-right pb-2 px-3 text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                  {t("dividends.col.ttm_total_usd")}
                </th>
                <th className="text-right pb-2 px-3 text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                  {t("dividends.col.next_ex")}
                </th>
                <th className="text-right pb-2 pl-3 text-xs uppercase tracking-[0.04em] font-medium text-whisper">
                  {t("dividends.col.next_estimate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((i) => {
                const isExpanded = expandedCode === i.code;
                const hasAny = i.ttm_total_usd > 0 || !!i.next_ex_date || i.history_count > 0;
                if (!hasAny) {
                  return (
                    <tr
                      key={i.code}
                      className="border-t border-rule text-whisper italic"
                    >
                      <td className="py-3 pr-3">
                        <span className="not-italic text-ink">{i.ticker}</span>
                        <span className="ml-2 text-xs">{i.name}</span>
                      </td>
                      <td colSpan={7} className="py-3 px-3 text-xs">
                        {t("dividends.no_history")}
                      </td>
                    </tr>
                  );
                }
                const lastPayment = i.history[0] ?? null;
                const historyState = historyByCode[i.code];
                return (
                  <Fragment key={i.code}>
                    <tr
                      className={`border-t border-rule cursor-pointer ${
                        isExpanded ? "bg-surface-expanded" : "hover:bg-surface-hover"
                      }`}
                      onClick={() => toggleRow(i.code)}
                      tabIndex={0}
                      role="button"
                      aria-expanded={isExpanded}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleRow(i.code);
                        }
                      }}
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-ink">{i.ticker}</span>
                          {i.is_reit && (
                            <span
                              className="text-xs text-quiet"
                              title={t("dividends.reit_footnote")}
                              aria-label={t("dividends.reit_footnote")}
                            >
                              †
                            </span>
                          )}
                        </div>
                        <span className="block text-xs text-quiet">{i.name}</span>
                      </td>
                      <td className="py-3 px-3 text-quiet text-xs tabular">
                        {i.currency}
                      </td>
                      <td className="py-3 px-3 text-right tabular text-quiet text-xs">
                        {lastPayment
                          ? formatExDate(lastPayment.ex_date, locale)
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right tabular text-ink">
                        {lastPayment
                          ? fmtCurrency(
                              lastPayment.amount_per_share_native,
                              i.currency,
                              { decimals: 4 },
                            )
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right tabular text-ink">
                        {i.ttm_per_share_native > 0
                          ? fmtCurrency(i.ttm_per_share_native, i.currency, {
                              decimals: 4,
                            })
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right tabular text-ink">
                        {i.ttm_total_usd > 0
                          ? fmtUsd(i.ttm_total_usd, { decimals: 2 })
                          : "—"}
                      </td>
                      <td className="py-3 px-3 text-right tabular text-quiet text-xs">
                        {i.next_ex_date
                          ? formatExDate(i.next_ex_date, locale)
                          : "—"}
                      </td>
                      <td className="py-3 pl-3 text-right tabular text-ink">
                        {i.next_amount_total_usd
                          ? fmtUsd(i.next_amount_total_usd, { decimals: 2 })
                          : "—"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface-expanded">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.06em] text-quiet mb-2">
                            {t("dividends.history.heading")}
                          </div>
                          {historyState?.kind === "loading" && (
                            <div className="text-xs text-whisper">
                              {t("dividends.history.loading")}
                            </div>
                          )}
                          {historyState?.kind === "error" && (
                            <div className="text-xs text-loss">
                              {t("dividends.history.load_failed", {
                                detail: historyState.detail,
                              })}
                            </div>
                          )}
                          {historyState?.kind === "ready" &&
                            historyState.data.history.length === 0 && (
                              <div className="text-xs text-whisper italic">
                                {t("dividends.history.empty")}
                              </div>
                            )}
                          {historyState?.kind === "ready" &&
                            historyState.data.history.length > 0 && (
                              <ul className="text-sm tabular space-y-1">
                                {historyState.data.history.map((p) => (
                                  <li
                                    key={p.ex_date}
                                    className="grid grid-cols-[8rem_8rem_1fr] gap-x-4 items-baseline"
                                  >
                                    <span className="text-quiet text-xs">
                                      {formatExDate(p.ex_date, locale)}
                                    </span>
                                    <span className="text-ink">
                                      {fmtCurrency(
                                        p.amount_per_share_native,
                                        i.currency,
                                        { decimals: 4 },
                                      )}
                                    </span>
                                    <span className="text-quiet text-xs">
                                      {fmtUsd(p.amount_total_usd, {
                                        decimals: 2,
                                      })}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-whisper mt-3 leading-[1.5]">
        {t("dividends.fx_caveat")}
        {hasReit && (
          <>
            <br />
            <span className="text-quiet">† </span>
            {t("dividends.reit_footnote")}
          </>
        )}
      </div>

      {insightOpen && (
        <div className="mt-4 bg-surface-raised border border-rule rounded-sm px-4 py-3">
          {insight.kind === "loading" && (
            <div
              role="status"
              aria-label={t("common.drafting_commentary")}
              className="flex flex-col gap-3"
            >
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[5rem_1fr] gap-x-3 items-center"
                >
                  <div className="h-3 w-16 rounded bg-rule/40 animate-pulse" />
                  <div className="h-4 w-full rounded bg-rule/40 animate-pulse" />
                </div>
              ))}
            </div>
          )}
          {insight.kind === "unavailable" && (
            <div className="text-sm text-whisper italic">{insight.detail}</div>
          )}
          {insight.kind === "error" && (
            <div className="text-sm text-loss">
              {t("common.commentary_unavailable", { detail: insight.detail })}
            </div>
          )}
          {insight.kind === "ready" && (
            <dl className="flex flex-col gap-3 text-sm leading-[1.65]">
              {insight.data.what && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">
                    {t("common.what")}
                  </dt>
                  <dd className="text-ink">{insight.data.what}</dd>
                </div>
              )}
              {insight.data.meaning && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">
                    {t("common.meaning")}
                  </dt>
                  <dd className="text-ink">{insight.data.meaning}</dd>
                </div>
              )}
              {insight.data.watch && (
                <div className="grid grid-cols-[5rem_1fr] gap-x-3 items-baseline">
                  <dt className="text-xs uppercase tracking-wide text-quiet">
                    {t("common.watch")}
                  </dt>
                  <dd className="text-ink">{insight.data.watch}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}

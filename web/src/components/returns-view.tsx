"use client";

/**
 * Client presentation layer for the /portfolio Returns tab. The tab
 * (returns-tab.tsx) is a SERVER component doing the data fetch; this view
 * holds all the JSX so it can call useT() for live language toggle.
 *
 * Renders the unavailable state itself when summary/detail come back null.
 */

import type {
  ReturnsSummary,
  ReturnsDetail,
  ReturnsHolding,
} from "@/lib/api";
import { ReturnsCsvButton } from "./returns-csv-button";
import { useT } from "@/lib/i18n/use-t";
import type { StringKey } from "@/lib/i18n/strings";

interface Contributor {
  code: string;
  ticker: string;
  total_gain_usd: number;
  total_gain_pct: number;
}

export interface ContributorsResponse {
  highest: Contributor[];
  lowest: Contributor[];
}

function fmtUsd(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function fmtUsdSigned(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${fmtUsd(Math.abs(value))}`;
}

function fmtPct(value: number, sign = true): string {
  const arrow = sign && value > 0 ? "+" : value < 0 ? "−" : "";
  return `${arrow}${(Math.abs(value) * 100).toFixed(2)}%`;
}

function gainClass(value: number): string {
  if (value > 0) return "text-[var(--accent-success)]";
  if (value < 0) return "text-[var(--accent-danger)]";
  return "text-quiet";
}

interface SegmentBarProps {
  segments: Array<{ label: string; value: number; tone: "primary" | "secondary" | "muted" }>;
}

// Adjacent segments must be distinguishable: gold for unrealized, graphite for
// dividends (both were gold and read as one segment), rule-gray for the
// zero/pending components. Status colors stay reserved for status.
const TONE_FILL: Record<SegmentBarProps["segments"][number]["tone"], string> = {
  primary: "var(--accent-primary)",
  secondary: "var(--quiet)",
  // Lightest ramp step that still clears 2:1 vs the surface (rule doesn't).
  muted: "var(--slice-7)",
};

function StackedBar({ segments }: SegmentBarProps) {
  const total = segments.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
  return (
    // gap-0.5 = the 2px surface gap doing the separating between segments.
    <div className="flex gap-0.5 h-2 w-full rounded-full overflow-hidden bg-surface">
      {segments.map((s) => {
        const pct = (Math.abs(s.value) / total) * 100;
        if (pct < 0.5) return null;
        return (
          <div
            key={s.label}
            style={{ width: `${pct}%`, background: TONE_FILL[s.tone] }}
            title={`${s.label}: ${fmtUsd(s.value)}`}
          />
        );
      })}
    </div>
  );
}

interface Props {
  summary: ReturnsSummary | null;
  detail: ReturnsDetail | null;
  contributors: ContributorsResponse | null;
}

export function ReturnsView({ summary, detail, contributors }: Props) {
  const t = useT();

  if (!summary || !detail) {
    return (
      <section className="rounded-xl border border-dashed border-rule bg-surface-raised p-10 text-center">
        <p className="text-sm font-medium text-ink">{t("returns.unavailable")}</p>
        <p className="mt-2 text-xs text-quiet">{t("returns.backend_unreachable")}</p>
      </section>
    );
  }

  const breakdownSegments: SegmentBarProps["segments"] = [
    { label: t("returns.seg.unrealized"), value: summary.unrealized_usd, tone: "primary" },
    { label: t("returns.seg.dividends"), value: summary.dividends_usd, tone: "secondary" },
    { label: t("returns.seg.realized"), value: 0, tone: "muted" },
    { label: t("returns.seg.currency"), value: 0, tone: "muted" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <BreakdownCard summary={summary} segments={breakdownSegments} />
      <ContributorsRow contributors={contributors} />
      <DetailReport detail={detail} />
    </div>
  );
}

function BreakdownCard({
  summary,
  segments,
}: {
  summary: ReturnsSummary;
  segments: SegmentBarProps["segments"];
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-ink">{t("returns.breakdown.heading")}</h2>
        <p className="text-xs text-quiet">{t("returns.breakdown.lifetime_usd")}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <BreakdownTile
          label={t("returns.tile.unrealized")}
          value={fmtUsdSigned(summary.unrealized_usd)}
          tone={summary.unrealized_usd >= 0 ? "pos" : "neg"}
        />
        <BreakdownTile
          label={t("returns.tile.realized")}
          value="—"
          tone="muted"
          sub={t("returns.tile.pending_tx")}
        />
        <BreakdownTile
          label={t("returns.tile.dividends_ttm")}
          value={fmtUsd(summary.dividends_usd, 2)}
          tone="pos"
        />
        <BreakdownTile
          label={t("returns.tile.currency")}
          value="—"
          tone="muted"
          sub={t("returns.tile.pending_tx")}
        />
        <BreakdownTile
          label={t("returns.tile.total")}
          value={fmtUsdSigned(summary.total_usd)}
          tone={summary.total_usd >= 0 ? "pos" : "neg"}
          highlight
        />
      </div>

      <div className="flex flex-col gap-2">
        <StackedBar segments={segments} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-quiet">
          {segments
            .filter((s) => Math.abs(s.value) > 0)
            .map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: TONE_FILL[s.tone] }}
                />
                {s.label}
              </span>
            ))}
        </div>
        <p className="text-[11px] text-whisper italic">{t("returns.breakdown.caveat")}</p>
      </div>
    </section>
  );
}

function BreakdownTile({
  label,
  value,
  tone,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg" | "muted";
  sub?: string;
  highlight?: boolean;
}) {
  const valueClass =
    tone === "pos"
      ? "text-[var(--accent-success)]"
      : tone === "neg"
        ? "text-[var(--accent-danger)]"
        : "text-quiet";
  return (
    <div
      className={
        "flex flex-col gap-1 rounded-lg p-3 " +
        (highlight ? "bg-surface ring-1 ring-rule" : "")
      }
    >
      <span className="text-[10px] uppercase tracking-[0.08em] text-quiet">{label}</span>
      <span className={`tabular text-lg font-medium ${valueClass}`}>{value}</span>
      {sub ? <span className="text-[10px] text-whisper">{sub}</span> : null}
    </div>
  );
}

function ContributorsRow({
  contributors,
}: {
  contributors: ContributorsResponse | null;
}) {
  const t = useT();
  if (!contributors) {
    return (
      <section className="rounded-xl border border-rule bg-surface-raised p-6">
        <p className="text-xs text-quiet">{t("returns.contributors.unavailable")}</p>
      </section>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ContributorsList title={t("returns.contributors.highest")} rows={contributors.highest} tone="pos" />
      <ContributorsList title={t("returns.contributors.lowest")} rows={contributors.lowest} tone="neg" />
    </div>
  );
}

function ContributorsList({
  title,
  rows,
}: {
  title: string;
  rows: Contributor[];
  tone: "pos" | "neg";
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">{t("hero.usd")}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <li className="text-xs text-quiet">{t("returns.contributors.none")}</li>
        ) : (
          rows.map((r) => (
            <li key={r.code} className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink font-medium">{r.ticker}</span>
              <div className="flex items-baseline gap-2 tabular">
                <span className={gainClass(r.total_gain_usd)}>
                  {fmtUsdSigned(r.total_gain_usd)}
                </span>
                <span className={`text-xs ${gainClass(r.total_gain_pct)}`}>
                  {fmtPct(r.total_gain_pct)}
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
      <p className="text-[10px] text-whisper italic">{t("returns.contributors.caveat")}</p>
    </section>
  );
}

function DetailReport({ detail }: { detail: ReturnsDetail }) {
  const t = useT();
  const headerKeys: StringKey[] = [
    "returns.col.ticker",
    "returns.col.shares",
    "returns.col.avg",
    "returns.col.price",
    "returns.col.value_usd",
    "returns.col.cost_basis",
    "returns.col.unrealized",
    "returns.col.div_ttm",
    "returns.col.total_gain",
  ];
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-ink">{t("returns.detail.heading")}</h2>
        <ReturnsCsvButton rows={detail.holdings} asOf={detail.as_of} label={t("returns.detail.download_csv")} />
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-rule text-quiet">
              {headerKeys.map((h) => (
                <th
                  key={h}
                  className="py-2 text-right px-3 text-[10px] uppercase tracking-[0.06em] font-medium first:text-left"
                >
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detail.holdings.map((h: ReturnsHolding) => (
              <tr key={h.code} className="border-b border-rule/40 hover:bg-surface-hover">
                <td className="py-3 px-3 align-top">
                  <span className="text-base font-medium text-ink">{h.ticker}</span>
                  <p className="text-[10px] text-quiet">{h.name}</p>
                </td>
                <td className="py-3 px-3 text-right tabular text-ink">{h.shares.toFixed(0)}</td>
                <td className="py-3 px-3 text-right tabular text-quiet">{h.avg_price.toFixed(2)}</td>
                <td className="py-3 px-3 text-right tabular text-ink">{h.current_price.toFixed(2)}</td>
                <td className="py-3 px-3 text-right tabular text-ink font-medium">{fmtUsd(h.value_usd, 0)}</td>
                <td className="py-3 px-3 text-right tabular text-quiet">{fmtUsd(h.cost_basis_usd, 0)}</td>
                <td className="py-3 px-3 text-right tabular">
                  <div className={`${gainClass(h.unrealized_usd)} font-medium`}>
                    {fmtUsdSigned(h.unrealized_usd)}
                  </div>
                  <div className={`text-[10px] ${gainClass(h.unrealized_pct)}`}>
                    {fmtPct(h.unrealized_pct)}
                  </div>
                </td>
                <td className="py-3 px-3 text-right tabular text-quiet">
                  {h.dividends_ttm_usd > 0 ? fmtUsd(h.dividends_ttm_usd, 2) : "—"}
                </td>
                <td className="py-3 px-3 text-right tabular">
                  <div className={`${gainClass(h.total_gain_usd)} font-medium`}>
                    {fmtUsdSigned(h.total_gain_usd)}
                  </div>
                  <div className={`text-[10px] ${gainClass(h.total_gain_pct)}`}>
                    {fmtPct(h.total_gain_pct)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

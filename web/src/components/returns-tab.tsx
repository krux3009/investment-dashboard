/**
 * /portfolio Returns tab. Mirrors SimplyWall.st's Returns surface:
 *   • Breakdown stacked-bar (unrealized + realized + dividends + currency)
 *   • Highest / Lowest contributor lists
 *   • Detailed Returns Report table
 *   • CSV download button
 *
 * Data sources:
 *   • /api/returns/summary   — top stacked-bar inputs
 *   • /api/returns/contributors  — top + bottom lists
 *   • /api/returns/detail    — table rows + CSV source
 *
 * realized_usd + currency_impact_usd come back as 0 with partial=true
 * because moomoo OpenD doesn't expose realized P&L or transaction
 * history. Those segments + columns render greyed with a one-line
 * "Connect transactions for full detail" caption.
 */

import {
  fetchReturnsSummary,
  fetchReturnsDetail,
  type ReturnsSummary,
  type ReturnsDetail,
  type ReturnsHolding,
} from "@/lib/api";
import { ReturnsCsvButton } from "./returns-csv-button";

async function safeFetchAll() {
  const [summary, detail, contributors] = await Promise.all([
    safeFetchSummary(),
    safeFetchDetail(),
    safeFetchContributors(),
  ]);
  return { summary, detail, contributors };
}

async function safeFetchSummary(): Promise<ReturnsSummary | null> {
  try {
    return await fetchReturnsSummary();
  } catch (e) {
    console.warn("fetchReturnsSummary failed:", e);
    return null;
  }
}

async function safeFetchDetail(): Promise<ReturnsDetail | null> {
  try {
    return await fetchReturnsDetail();
  } catch (e) {
    console.warn("fetchReturnsDetail failed:", e);
    return null;
  }
}

interface Contributor {
  code: string;
  ticker: string;
  total_gain_usd: number;
  total_gain_pct: number;
}

interface ContributorsResponse {
  highest: Contributor[];
  lowest: Contributor[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

async function safeFetchContributors(): Promise<ContributorsResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/returns/contributors?n=5`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ContributorsResponse;
  } catch (e) {
    console.warn("fetchReturnsContributors failed:", e);
    return null;
  }
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
  segments: Array<{ label: string; value: number; tone: "primary" | "muted" | "warn" }>;
}

const TONE_FILL: Record<SegmentBarProps["segments"][number]["tone"], string> = {
  primary: "var(--accent-primary)",
  muted: "var(--rule)",
  warn: "var(--accent-warn)",
};

function StackedBar({ segments }: SegmentBarProps) {
  const total = segments.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden bg-surface">
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

export async function ReturnsTab() {
  const { summary, detail, contributors } = await safeFetchAll();

  if (!summary || !detail) {
    return (
      <section className="rounded-xl border border-dashed border-rule bg-surface-raised p-10 text-center">
        <p className="text-sm font-medium text-ink">Returns data unavailable.</p>
        <p className="mt-2 text-xs text-quiet">
          Backend unreachable — check the FastAPI server on port 8000.
        </p>
      </section>
    );
  }

  const breakdownSegments: SegmentBarProps["segments"] = [
    { label: "Unrealized", value: summary.unrealized_usd, tone: "primary" },
    { label: "Dividends", value: summary.dividends_usd, tone: "primary" },
    { label: "Realized", value: 0, tone: "muted" },
    { label: "Currency", value: 0, tone: "muted" },
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
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-ink">Returns Breakdown</h2>
        <p className="text-xs text-quiet">Lifetime, USD</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <BreakdownTile
          label="Unrealized"
          value={fmtUsdSigned(summary.unrealized_usd)}
          tone={summary.unrealized_usd >= 0 ? "pos" : "neg"}
        />
        <BreakdownTile label="Realized" value="—" tone="muted" sub="Pending tx history" />
        <BreakdownTile label="Dividends (TTM)" value={fmtUsd(summary.dividends_usd, 2)} tone="pos" />
        <BreakdownTile label="Currency" value="—" tone="muted" sub="Pending tx history" />
        <BreakdownTile
          label="Total"
          value={fmtUsdSigned(summary.total_usd)}
          tone={summary.total_usd >= 0 ? "pos" : "neg"}
          highlight
        />
      </div>

      <div className="flex flex-col gap-2">
        <StackedBar segments={segments} />
        <p className="text-[11px] text-whisper italic">
          Realized P&L + currency-impact require transaction history;
          moomoo OpenD currently exposes only positions + average cost.
        </p>
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
  if (!contributors) {
    return (
      <section className="rounded-xl border border-rule bg-surface-raised p-6">
        <p className="text-xs text-quiet">Contributors unavailable.</p>
      </section>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ContributorsList title="Highest Contributors" rows={contributors.highest} tone="pos" />
      <ContributorsList title="Lowest Contributors" rows={contributors.lowest} tone="neg" />
    </div>
  );
}

function ContributorsList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: Contributor[];
  tone: "pos" | "neg";
}) {
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="text-[10px] uppercase tracking-[0.08em] text-quiet">USD</p>
      </header>
      <ul className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <li className="text-xs text-quiet">No contributors on record.</li>
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
      <p className="text-[10px] text-whisper italic">
        Total = unrealized + TTM dividends. Realized + currency excluded.
      </p>
    </section>
  );
}

function DetailReport({ detail }: { detail: ReturnsDetail }) {
  return (
    <section className="rounded-xl border border-rule bg-surface-raised p-6 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-ink">Detailed Returns Report</h2>
        <ReturnsCsvButton rows={detail.holdings} asOf={detail.as_of} />
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-quiet">
              {[
                "Ticker", "Shares", "Avg", "Price", "Value (USD)",
                "Cost Basis", "Unrealized", "Div. TTM", "Total Gain",
              ].map((h) => (
                <th
                  key={h}
                  className="py-2 text-right px-3 text-[10px] uppercase tracking-[0.06em] font-medium first:text-left"
                >
                  {h}
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

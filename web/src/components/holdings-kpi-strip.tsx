"use client";

/**
 * HoldingsKpiStrip — client wrapper around KpiStrip for the /portfolio
 * Holdings tab. page.tsx is a SERVER component and can't call useT, so it
 * passes the numeric values (already USD-formatted) here; this builds the
 * four tiles with translated labels + captions and self-translates the
 * partial caption.
 *
 * Realized + currency stay stubbed ("—") until the transaction-history
 * layer ships.
 */

import { KpiStrip } from "@/components/kpi-strip";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  // Pre-formatted values from page.tsx (numeric formatting stays there).
  unrealizedValue: string;        // fmtUsdSigned(...) or "—"
  unrealizedSign: "pos" | "neg" | null; // null → backend unreachable
  dividendsValue: string;         // fmtUsd(...) or "—"
  partial: boolean;
  available: boolean;             // false → backend unreachable
}

export function HoldingsKpiStrip({
  unrealizedValue,
  unrealizedSign,
  dividendsValue,
  partial,
  available,
}: Props) {
  const t = useT();

  if (!available) {
    const unreachable = t("portfolio.kpi.backend_unreachable");
    return (
      <KpiStrip
        tiles={[
          { label: t("portfolio.kpi.unrealized"), value: "—", sub: unreachable },
          { label: t("portfolio.kpi.realized"), value: "—", sub: unreachable },
          { label: t("portfolio.kpi.dividends_ttm"), value: "—", sub: unreachable },
          { label: t("portfolio.kpi.currency"), value: "—", sub: unreachable },
        ]}
      />
    );
  }

  const connectTx = t("portfolio.kpi.connect_tx");
  return (
    <KpiStrip
      tiles={[
        {
          label: t("portfolio.kpi.unrealized"),
          value: unrealizedValue,
          sub:
            unrealizedSign === "neg"
              ? t("portfolio.kpi.loss_on_paper")
              : t("portfolio.kpi.gain_on_paper"),
        },
        { label: t("portfolio.kpi.realized"), value: "—", sub: connectTx },
        {
          label: t("portfolio.kpi.dividends_ttm"),
          value: dividendsValue,
          sub: t("portfolio.kpi.trailing_12m"),
        },
        { label: t("portfolio.kpi.currency"), value: "—", sub: connectTx },
      ]}
      caption={partial ? t("portfolio.kpi.partial_caption") : undefined}
    />
  );
}

import { Suspense } from "react";
import {
  fetchForesight,
  fetchHoldings,
  fetchPortfolioSnowflake,
  fetchReturnsSummary,
} from "@/lib/api";
import type {
  ForesightResponse,
  PortfolioSnowflake,
  ReturnsSummary,
} from "@/lib/api";
import { Hero } from "@/components/hero";
import { ForesightBlock } from "@/components/foresight-block";
import { BlockSkeleton } from "@/components/block-skeleton";
import { KpiStrip } from "@/components/kpi-strip";
import type { KpiTileProps, KpiTileSign } from "@/components/kpi-tile";

async function safeFetchForesight(): Promise<ForesightResponse | null> {
  try {
    return await fetchForesight(7);
  } catch (e) {
    console.warn("fetchForesight failed, hiding block:", e);
    return null;
  }
}

async function safeFetchSnowflake(): Promise<PortfolioSnowflake | null> {
  try {
    return await fetchPortfolioSnowflake();
  } catch (e) {
    console.warn("fetchPortfolioSnowflake failed:", e);
    return null;
  }
}

async function safeFetchReturns(): Promise<ReturnsSummary | null> {
  try {
    return await fetchReturnsSummary();
  } catch (e) {
    console.warn("fetchReturnsSummary failed:", e);
    return null;
  }
}

async function ForesightSection() {
  const foresight = await safeFetchForesight();
  return foresight ? <ForesightBlock initial={foresight} /> : null;
}

function fmtUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtUsdSigned(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${fmtUsd(Math.abs(value))}`;
}

function signOf(value: number): KpiTileSign {
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "flat";
}

function buildKpiTiles(returns: ReturnsSummary | null): KpiTileProps[] {
  if (!returns) {
    return [
      { label: "Unrealized Returns", value: "—", sub: "Backend unreachable" },
      { label: "Realized Returns", value: "—", sub: "Backend unreachable" },
      { label: "Dividends (TTM)", value: "—", sub: "Backend unreachable" },
      { label: "Currency Impact", value: "—", sub: "Backend unreachable" },
    ];
  }
  return [
    {
      label: "Unrealized Returns",
      value: fmtUsdSigned(returns.unrealized_usd),
      sub: signOf(returns.unrealized_usd) === "pos" ? "gain on paper" : "loss on paper",
    },
    {
      label: "Realized Returns",
      value: "—",
      sub: "Connect transactions for full detail",
    },
    {
      label: "Dividends (TTM)",
      value: fmtUsd(returns.dividends_usd),
      sub: "trailing 12 months",
    },
    {
      label: "Currency Impact",
      value: "—",
      sub: "Connect transactions for full detail",
    },
  ];
}

export default async function Home() {
  const [data, snowflake, returns] = await Promise.all([
    fetchHoldings(),
    safeFetchSnowflake(),
    safeFetchReturns(),
  ]);

  const heroScores = snowflake?.scores ?? {
    valuation: null, future: null, past: null, health: null, dividends: null,
  };
  const tiles = buildKpiTiles(returns);

  return (
    <>
      <Hero data={data} snowflakeScores={heroScores} />

      <div className="mb-10">
        <KpiStrip
          tiles={tiles}
          caption={
            returns?.partial
              ? "Realized P&L + currency-impact require transaction history. Unrealized + dividends are live."
              : undefined
          }
        />
      </div>

      <Suspense fallback={<BlockSkeleton lines={5} />}>
        <ForesightSection />
      </Suspense>
    </>
  );
}

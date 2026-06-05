"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";

export type PortfolioTab =
  | "holdings"
  | "returns"
  | "updates"
  | "dividends"
  | "analysis"
  | "calendar";

interface Props {
  active: PortfolioTab;
}

const TABS: { key: PortfolioTab; labelKey: `portfolio.tab.${string}` }[] = [
  { key: "holdings",  labelKey: "portfolio.tab.holdings" },
  { key: "returns",   labelKey: "portfolio.tab.returns" },
  { key: "updates",   labelKey: "portfolio.tab.updates" },
  { key: "dividends", labelKey: "portfolio.tab.dividends" },
  { key: "analysis",  labelKey: "portfolio.tab.analysis" },
  { key: "calendar",  labelKey: "portfolio.tab.calendar" },
];

export function PortfolioTabNav({ active }: Props) {
  const t = useT();

  return (
    <nav
      className="flex flex-nowrap gap-1 mb-6 border-b border-rule overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label={t("portfolio.tab.aria")}
    >
      {TABS.map((tab) => {
        const on = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/portfolio?tab=${tab.key}`}
            prefetch
            aria-current={on ? "page" : undefined}
            className={[
              "relative shrink-0 whitespace-nowrap px-3 py-2 text-sm transition-colors",
              on ? "text-ink font-medium" : "text-quiet hover:text-ink",
            ].join(" ")}
          >
            {t(tab.labelKey as Parameters<typeof t>[0])}
            {on && (
              <span
                aria-hidden
                className="absolute left-2 right-2 -bottom-px h-0.5 bg-[var(--accent-primary)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

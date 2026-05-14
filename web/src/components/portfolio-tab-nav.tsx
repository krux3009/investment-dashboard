"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/use-t";

interface Props {
  active: "table" | "calendar";
}

export function PortfolioTabNav({ active }: Props) {
  const t = useT();
  const cls = (on: boolean) =>
    `px-2 py-1 rounded-sm tabular text-xs ${
      on
        ? "text-ink border border-rule"
        : "text-quiet hover:text-ink border border-transparent"
    }`;

  return (
    <nav
      className="flex gap-1 mb-8"
      aria-label={t("portfolio.tab.aria")}
    >
      <Link
        href="/portfolio?tab=table"
        className={cls(active === "table")}
        aria-current={active === "table" ? "page" : undefined}
      >
        {t("portfolio.tab.table")}
      </Link>
      <Link
        href="/portfolio?tab=calendar"
        className={cls(active === "calendar")}
        aria-current={active === "calendar" ? "page" : undefined}
      >
        {t("portfolio.tab.calendar")}
      </Link>
    </nav>
  );
}

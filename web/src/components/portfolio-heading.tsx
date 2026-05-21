"use client";

/**
 * PortfolioHeading — client h1 for the /portfolio page. page.tsx is a
 * SERVER component and can't call useT, so the page title self-translates
 * here via the existing portfolio.heading key.
 */

import { useT } from "@/lib/i18n/use-t";

export function PortfolioHeading() {
  const t = useT();
  return (
    <h1 className="font-serif text-3xl font-medium text-ink">{t("portfolio.heading")}</h1>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { LocaleToggle } from "./locale-toggle";
import { useT } from "@/lib/i18n/use-t";
import type { StringKey } from "@/lib/i18n/strings";

const TABS: { href: string; key: StringKey }[] = [
  { href: "/", key: "nav.home" },
  { href: "/portfolio", key: "nav.portfolio" },
  { href: "/watchlist", key: "nav.watchlist" },
];

export function NavBar() {
  const pathname = usePathname();
  const t = useT();
  return (
    <header className="flex items-baseline justify-between mb-12">
      <div className="flex items-baseline gap-8">
        <div className="text-sm font-medium tracking-wide text-quiet">
          {t("nav.brand")}
        </div>
        <nav className="flex items-baseline gap-5 text-xs">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`pb-1 border-b ${
                  active
                    ? "text-ink border-ink"
                    : "text-quiet border-transparent hover:text-ink"
                } transition-colors`}
              >
                {t(tab.key)}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-baseline gap-4">
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}

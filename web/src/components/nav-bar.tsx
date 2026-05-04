"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

const TABS = [
  { href: "/", label: "home" },
  { href: "/portfolio", label: "portfolio" },
  { href: "/watchlist", label: "watchlist" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="flex items-baseline justify-between mb-12">
      <div className="flex items-baseline gap-8">
        <div className="text-sm font-medium tracking-wide text-quiet">
          quiet ledger
        </div>
        <nav className="flex items-baseline gap-5 text-xs">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`pb-1 border-b ${
                  active
                    ? "text-ink border-ink"
                    : "text-quiet border-transparent hover:text-ink"
                } transition-colors`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <ThemeToggle />
    </header>
  );
}

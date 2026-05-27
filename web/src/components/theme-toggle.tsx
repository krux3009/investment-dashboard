"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/use-t";

// v4: two-state cycle dark ↔ light. SWS-faithful default is dark; system
// preference is no longer followed (see web/src/app/layout.tsx).
export function ThemeToggle() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes is client-only; render a stub until hydrated to avoid mismatch.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span className="text-xs uppercase tracking-wider text-quiet">
        {t("toggle.theme.label")}
      </span>
    );
  }

  const current = theme === "light" ? "light" : "dark";
  const label = t(current === "dark" ? "toggle.theme.value.dark" : "toggle.theme.value.light");
  const cycle = () => setTheme(current === "dark" ? "light" : "dark");

  return (
    <button
      type="button"
      onClick={cycle}
      className="text-xs uppercase tracking-wider text-quiet hover:text-ink transition-colors"
      aria-label={t("toggle.theme.aria", { label })}
    >
      {label}
    </button>
  );
}

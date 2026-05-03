"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// Three-state cycle: system → light → dark → system. The label always
// shows the *current* effective theme; click swaps to the next.
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes is client-only; render a stub until hydrated to avoid mismatch.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span className="text-xs uppercase tracking-wider text-quiet">
        theme
      </span>
    );
  }

  const cycle = () => {
    if (theme === "system") setTheme("light");
    else if (theme === "light") setTheme("dark");
    else setTheme("system");
  };

  const label = theme === "system" ? `system (${resolvedTheme})` : theme;

  return (
    <button
      type="button"
      onClick={cycle}
      className="text-xs uppercase tracking-wider text-quiet hover:text-ink transition-colors"
      aria-label={`Theme: ${label}. Click to cycle.`}
    >
      {label}
    </button>
  );
}

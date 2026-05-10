"use client";

import { useLocale, type Locale } from "@/lib/i18n/locale-provider";
import { useT } from "@/lib/i18n/use-t";

const LABELS: Record<Locale, string> = { en: "EN", zh: "中" };

export function LocaleToggle() {
  const { locale, toggle, mounted } = useLocale();
  const t = useT();

  // Render the default label until the client mounts and rehydrates from
  // localStorage — keeps the SSR HTML stable.
  if (!mounted) {
    return (
      <span className="text-xs uppercase tracking-wider text-quiet">
        {LABELS.en}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="text-xs uppercase tracking-wider text-quiet hover:text-ink transition-colors"
      aria-label={t("toggle.locale.aria", { label: LABELS[locale] })}
    >
      {LABELS[locale]}
    </button>
  );
}

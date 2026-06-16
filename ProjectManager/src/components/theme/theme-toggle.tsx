"use client";

import { useTranslations } from "next-intl";
import { Button } from "../ui/button";
import { useTheme, type Theme } from "./theme-provider";

const THEMES: Theme[] = ["light", "system", "dark"];

/**
 * Segmented light / system / dark switch. "System" follows the OS preference;
 * the active option is highlighted with the primary token. Labels are localized.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("theme");

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-muted p-1"
    >
      {THEMES.map((value) => (
        <Button
          key={value}
          size="sm"
          variant={theme === value ? "primary" : "ghost"}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          {t(value)}
        </Button>
      ))}
    </div>
  );
}

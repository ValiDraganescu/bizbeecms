"use client";

import { Button } from "../ui/button";
import { useTheme, type Theme } from "./theme-provider";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

/**
 * Segmented light / system / dark switch. "System" follows the OS preference;
 * the active option is highlighted with the primary token.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-muted p-1"
    >
      {OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={theme === opt.value ? "primary" : "ghost"}
          aria-pressed={theme === opt.value}
          onClick={() => setTheme(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

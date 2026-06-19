"use client";

/**
 * Shared CONTENT-locale picker for per-locale editing (page-builder + beyond).
 *
 * Every per-locale form (SEO meta, translatable component props, …) used to
 * STACK one field-set per content locale vertically — fine for 2 locales,
 * unusable at 20. This component replaces the stack with a single selector that
 * shows ONLY the active locale's fields at a time, so the UX is identical
 * everywhere per-locale content is edited.
 *
 * Storage is UNCHANGED: values stay `{ en: "...", fi: "...", … }` maps; this is
 * purely a VIEW over one locale. Callers keep using `setLocaleValue` /
 * `setLocalizedProp`. The picker only owns "which locale am I editing now".
 *
 * ponytail: tabs when ≤4 locales, a <select> beyond that — no combobox lib. The
 * active-locale state is a plain `useState` exposed via `useLocalePicker` so a
 * parent can share ONE picker across multiple fields (e.g. the whole SEO form).
 */

import { useState } from "react";

/** Active-locale state for a per-locale form. Defaults to the first (Site
 * default) locale. `locales` is the Site's content-locale list (default first). */
export function useLocalePicker(locales: string[]) {
  const [active, setActive] = useState(locales[0] ?? "");
  // If the locale set changes out from under us (locale removed), fall back.
  const safe = locales.includes(active) ? active : (locales[0] ?? "");
  return { active: safe, setActive, locales };
}

export type LocalePickerState = ReturnType<typeof useLocalePicker>;

/**
 * The selector control. Renders nothing for a single-locale Site (no choice to
 * make), tabs for a handful, a dropdown beyond `tabsMax`.
 */
export function LocalePicker({
  state,
  label,
  tabsMax = 4,
}: {
  state: LocalePickerState;
  /** Accessible label for the control (e.g. "Editing language"). */
  label: string;
  tabsMax?: number;
}) {
  const { active, setActive, locales } = state;
  if (locales.length <= 1) return null;

  if (locales.length <= tabsMax) {
    return (
      <div
        role="tablist"
        aria-label={label}
        className="flex flex-wrap gap-1 rounded-md border border-border bg-surface p-1"
      >
        {locales.map((loc) => (
          <button
            key={loc}
            type="button"
            role="tab"
            aria-selected={loc === active}
            onClick={() => setActive(loc)}
            className={
              "rounded px-2.5 py-1 font-mono text-xs uppercase tracking-wide transition-colors " +
              (loc === active
                ? "bg-primary text-primary-foreground"
                : "text-foreground-muted hover:text-foreground")
            }
          >
            {loc}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-foreground-muted">{label}</span>
      <select
        aria-label={label}
        value={active}
        onChange={(e) => setActive(e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs uppercase text-foreground"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {loc}
          </option>
        ))}
      </select>
    </label>
  );
}

"use client";

/**
 * One translatable component prop, edited PER LOCALE with an inline language
 * switcher + an AI-translate menu (target one locale or all). Replaces the
 * form-level single LocalePicker for translatable fields: each field owns which
 * locale it's viewing and its own translate action.
 *
 * Storage is unchanged — the value is a `{ en, fi, … }` locale object; we read
 * the active locale via `localeFieldValue` and write via `setLocalizedProp`, then
 * hand the merged props up through `onChange` (the same path the editor autosaves).
 * Translate posts the DEFAULT-locale text to `/api/translate` and merges the
 * returned per-locale maps in — the rule is: author the default language, translate
 * out from it. The translate menu is disabled until the default text is non-empty.
 *
 * ponytail: native <details> for the translate menu (no popover lib); the lang
 * tabs reuse the LocalePicker look. Per-field state, so many fields coexist.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  localeFieldValue,
  setLocalizedProp,
  mergeTranslations,
  isLongText,
  type PropField,
} from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";

/** Show locale TABS up to this count; beyond it, a compact <select> (20-locale
 *  sites would wrap tabs into an unusable strip). Mirrors LocalePicker's threshold. */
const LOCALE_TABS_MAX = 6;

/** Abort a translate `fetch` that hasn't resolved by now, so the spinner can't
 *  hang forever. A touch above the server's DEFAULT_STREAM_IDLE_TIMEOUT_MS (45s)
 *  so a genuine server-side stall surfaces as its 504 rather than this abort. */
const CLIENT_TIMEOUT_MS = 60_000;

export function TranslatableField({
  field,
  schema,
  block,
  props,
  locales,
  onChange,
}: {
  field: PropField;
  /** The FULL component prop schema — mergeTranslations re-validates the whole
   *  props against it, so validation must not narrow to the one translated field
   *  (that would strip every sibling prop). */
  schema: PropField[];
  block: Block;
  props: Record<string, unknown>;
  /** Site content locales, default (source) first. */
  locales: string[];
  onChange: (props: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const defaultLocale = locales[0] ?? "";
  const [active, setActive] = useState(defaultLocale);
  const loc = locales.includes(active) ? active : defaultLocale;
  const [busy, setBusy] = useState<string | null>(null); // the target being translated
  const [error, setError] = useState<string | null>(null);

  const raw = props[field.name];
  const stored = localeFieldValue(raw, loc, defaultLocale);
  // Pre-fill the DEFAULT-locale field with the prop's authored `default` when the
  // block hasn't set it yet, so it's editable real text (not a greyed placeholder)
  // — matching what the page renders. Other locales stay empty (author the default
  // language, then translate out from it).
  const hasStored = typeof raw === "string" ? raw !== "" : raw != null && stored !== "";
  const value =
    !hasStored && loc === defaultLocale && typeof field.default === "string"
      ? field.default
      : stored;
  const sourceText = (loc === defaultLocale ? value : localeFieldValue(raw, defaultLocale, defaultLocale)).trim();
  const labelText = field.label || field.name;
  const otherLocales = locales.filter((l) => l !== defaultLocale);

  const inputCls =
    "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted";

  function setValue(next: string) {
    onChange({ ...props, [field.name]: setLocalizedProp(raw, loc, next, locales) });
  }

  // Translate the default-locale text into `targets` (one locale or all others),
  // merge the returned maps into props. Source is ALWAYS the default locale.
  async function translate(targets: string[]) {
    if (sourceText === "" || targets.length === 0) return;
    setError(null);
    setBusy(targets.length === 1 ? targets[0] : "all");
    // Client-side backstop: even though the server now bounds its model read, a
    // dropped connection / hung Worker could still leave `fetch` pending forever
    // (the "spinner never stops" bug). Abort after CLIENT_TIMEOUT_MS so the
    // spinner always clears with a message instead of hanging. The window is a
    // touch above the server's idle timeout so a real server 504 wins the race.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          kind: "component",
          target: block.component,
          fields: { [field.name]: sourceText },
          fromLocale: defaultLocale,
          toLocales: targets,
          // Don't persist at the component — we merge the returned maps into THIS
          // block's props and autosave (component artifacts can't hold per-use text).
          persist: false,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        translations?: Record<string, Record<string, string>>;
        error?: string;
        errors?: string[];
      };
      if (!res.ok || !j.ok || !j.translations) {
        setError(j.error ?? j.errors?.join("; ") ?? `HTTP ${res.status}`);
        return;
      }
      onChange(mergeTranslations(props, j.translations, schema, locales));
      // Jump the view to the locale we just filled (or the first target).
      if (!targets.includes(loc)) setActive(targets[0]);
    } catch (err) {
      setError(
        (err as Error).name === "AbortError"
          ? t("translateField.timeout")
          : (err as Error).message,
      );
    } finally {
      clearTimeout(timer);
      setBusy(null);
    }
  }

  const multi = locales.length > 1;

  return (
    <fieldset className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          {labelText}
          {field.required && <span className="text-danger"> *</span>}
        </span>
        {multi && (
          <div className="flex items-center gap-1">
            {/* Per-field language switcher: tabs for a handful, a <select> beyond
                LOCALE_TABS_MAX so 20 locales don't wrap into an unusable strip. */}
            {locales.length <= LOCALE_TABS_MAX ? (
              <div className="flex gap-0.5 rounded-md border border-border bg-surface p-0.5">
                {locales.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setActive(l)}
                    aria-pressed={l === loc}
                    className={
                      "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors " +
                      (l === loc
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground-muted hover:text-foreground")
                    }
                  >
                    {l}
                  </button>
                ))}
              </div>
            ) : (
              <select
                aria-label={t("localePickerLabel")}
                value={loc}
                onChange={(e) => setActive(e.target.value)}
                className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase text-foreground"
              >
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
            {/* Translate menu: target one locale or all */}
            <details className="relative">
              <summary
                aria-label={t("translateField.menuLabel")}
                title={t("translateField.menuLabel")}
                className={
                  "flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-md border border-border text-foreground-muted hover:text-foreground " +
                  (sourceText === "" ? "pointer-events-none opacity-40" : "")
                }
              >
                {busy ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" />
                  </svg>
                )}
              </summary>
              <div className="absolute right-0 z-10 mt-1 flex max-h-64 min-w-40 flex-col overflow-y-auto rounded-md border border-border bg-surface-raised py-1 shadow-lg">
                <button
                  type="button"
                  onClick={(e) => {
                    (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                    void translate(otherLocales);
                  }}
                  className="px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-muted"
                >
                  {t("translateField.all")}
                </button>
                {otherLocales.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={(e) => {
                      (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                      void translate([l]);
                    }}
                    className="px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-muted"
                  >
                    {t("translateField.one", { locale: l.toUpperCase() })}
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
      {field.description && (
        <span className="text-xs text-foreground-muted">{field.description}</span>
      )}

      {/* Textarea for richtext, or any string prop whose authored default / current
          value is long — so `string`-declared body copy isn't cramped in one line. */}
      {field.type === "richtext" || isLongText(field.default) || isLongText(value) ? (
        <textarea
          className={`${inputCls} min-h-16`}
          value={value}
          placeholder={field.default}
          aria-label={multi ? `${labelText} (${loc})` : labelText}
          onChange={(e) => setValue(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className={inputCls}
          value={value}
          placeholder={field.default}
          aria-label={multi ? `${labelText} (${loc})` : labelText}
          onChange={(e) => setValue(e.target.value)}
        />
      )}

      {/* Hint when viewing a non-default locale that has no text yet. */}
      {multi && loc !== defaultLocale && value === "" && sourceText !== "" && (
        <span className="text-[11px] text-foreground-muted">
          {t("translateField.emptyHint", { locale: loc.toUpperCase() })}
        </span>
      )}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </fieldset>
  );
}

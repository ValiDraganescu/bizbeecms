"use client";

/**
 * content-collections — Slice 5: type-aware item-field input.
 *
 * Renders the CORRECT native input per collection field type (mirrors the
 * page-builder type-aware inputs): native date/datetime/time, number, select,
 * bool toggle, multiselect (checkbox list), textarea for text/richtext, text
 * input otherwise. The VALUE shape mirrors the Slice-3 coercion contract:
 *   - bool      → boolean (coerced to 0/1 server-side)
 *   - int/number→ string (number input) / "" when empty
 *   - date*     → ISO-ish string from the native input
 *   - multiselect → string[] (server JSON-stringifies)
 *   - everything else → string
 *
 * PURE-ish: no fetch, no i18n — labels come from the field schema. The parent
 * owns the draft state and decides what to send (omits "" so defaults apply).
 *
 * ponytail: native <input type> does the heavy lifting; no date-picker lib.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CollectionField } from "@/lib/content/collection-schema";
import { ImagePicker } from "@/components/page-builder/image-picker";
import {
  type LocalizedDraft,
  draftLocaleText,
  setDraftLocaleText,
} from "@/lib/content/item-locale-fields";
import { executeTranslateCall } from "@/lib/content/translate-client";
import { Spinner } from "@/components/ui/spinner";

/** The standard admin input styling — shared by the content-collection forms. */
export const INPUT =
  "rounded-md border border-border bg-surface px-3 py-2 text-foreground";

export type FieldValue = string | boolean | string[] | LocalizedDraft;

/** Show locale TABS up to this count; beyond it, a compact <select>. Mirrors the
 *  page-builder TranslatableField threshold. */
const LOCALE_TABS_MAX = 6;

/** A blank value for a field type, matching the input's expected shape. */
export function blankValueFor(type: CollectionField["type"]): FieldValue {
  if (type === "bool" || type === "boolean") return false;
  if (type === "multiselect") return [];
  return "";
}

export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: CollectionField;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const id = `field-${field.name}`;
  const labelText = field.label || field.name;

  switch (field.type) {
    case "bool":
    case "boolean":
      return (
        <label className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="text-sm text-foreground">{labelText}</span>
        </label>
      );

    case "number":
    case "int":
      return (
        <Labelled id={id} label={labelText} required={field.required}>
          <input
            id={id}
            type="number"
            step={field.type === "int" ? "1" : "any"}
            className={INPUT}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </Labelled>
      );

    case "date":
      return (
        <Labelled id={id} label={labelText} required={field.required}>
          <input id={id} type="date" className={INPUT} value={asStr(value)} onChange={(e) => onChange(e.target.value)} />
        </Labelled>
      );
    case "datetime":
      return (
        <Labelled id={id} label={labelText} required={field.required}>
          <input
            id={id}
            type="datetime-local"
            className={INPUT}
            value={asStr(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </Labelled>
      );
    case "time":
      return (
        <Labelled id={id} label={labelText} required={field.required}>
          <input id={id} type="time" className={INPUT} value={asStr(value)} onChange={(e) => onChange(e.target.value)} />
        </Labelled>
      );

    case "select":
      return (
        <Labelled id={id} label={labelText} required={field.required}>
          <select id={id} className={INPUT} value={asStr(value)} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label || o.value}
              </option>
            ))}
          </select>
        </Labelled>
      );

    case "multiselect": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm text-foreground-muted">{labelText}</legend>
          <div className="flex flex-wrap gap-3">
            {(field.options ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-1 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, o.value]
                        : selected.filter((v) => v !== o.value),
                    )
                  }
                />
                {o.label || o.value}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }

    case "text":
    case "richtext":
      return (
        <Labelled id={id} label={labelText} required={field.required}>
          <textarea
            id={id}
            rows={4}
            className={INPUT}
            value={asStr(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </Labelled>
      );

    case "asset":
      // An asset URL → the SAME gallery picker the page builder uses (thumbnail
      // + Remove + modal gallery), so item images match placing a block image.
      // Not wrapped in <label htmlFor> — the picker is a button, not a form input.
      return (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground-muted">
            {labelText}
            {field.required ? " *" : ""}
          </span>
          <ImagePicker value={asStr(value)} onChange={(url) => onChange(url)} />
        </div>
      );

    default:
      // string / ref → plain text
      return (
        <Labelled id={id} label={labelText} required={field.required}>
          <input id={id} type="text" className={INPUT} value={asStr(value)} onChange={(e) => onChange(e.target.value)} />
        </Labelled>
      );
  }
}

/**
 * A translatable text field edited PER LOCALE with an inline language switcher +
 * an AI-translate menu — the item-editor twin of the page-builder
 * `TranslatableField`. The value is a locale object (or a bare string for a
 * default-only value); the parent owns it and sends it as-is (the write path
 * coerces the object). Translate posts the DEFAULT-locale text to /api/translate
 * and merges the returned per-locale maps in (author the default, translate out).
 */
export function TranslatableFieldInput({
  field,
  value,
  locales,
  tableName,
  onChange,
  onMergeTranslations,
}: {
  field: CollectionField;
  value: LocalizedDraft;
  /** Site content locales, default (source) first. */
  locales: string[];
  /** The collection table name — sent as the translate target for logging. */
  tableName: string;
  onChange: (v: LocalizedDraft) => void;
  /** Merge an /api/translate response for THIS field into the draft. The PARENT
   *  applies it against the LATEST state (functional update), so several fields
   *  translating at once never clobber each other (concurrency-safe). */
  onMergeTranslations: (translations: Record<string, Record<string, string>>) => void;
}) {
  const t = useTranslations("collections");
  const tp = useTranslations("pageBuilder");
  const defaultLocale = locales[0] ?? "";
  const [active, setActive] = useState(defaultLocale);
  const loc = locales.includes(active) ? active : defaultLocale;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labelText = field.label || field.name;
  const text = draftLocaleText(value, loc, defaultLocale);
  const sourceText = draftLocaleText(value, defaultLocale, defaultLocale).trim();
  const otherLocales = locales.filter((l) => l !== defaultLocale);
  const isLong = field.type === "text" || field.type === "richtext";

  function setLocaleText(next: string) {
    onChange(setDraftLocaleText(value, loc, next, locales));
  }

  async function translate(targets: string[]) {
    if (sourceText === "" || targets.length === 0) return;
    setError(null);
    setBusy(targets.length === 1 ? targets[0] : "all");
    const res = await executeTranslateCall(
      { fields: { [field.name]: sourceText }, toLocales: targets },
      { target: tableName, fromLocale: defaultLocale, timeoutMessage: tp("translateField.timeout") },
    );
    if (res.ok) {
      // Hand the raw translations up; the parent merges them into the LATEST
      // draft state, so a second field translating concurrently can't overwrite
      // this one (the previous approach merged into the stale `value` prop).
      onMergeTranslations(res.translations);
      if (!targets.includes(loc)) setActive(targets[0]);
    } else {
      setError(res.message);
    }
    setBusy(null);
  }

  const multi = locales.length > 1;
  const inputCls =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground";

  return (
    <fieldset className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground-muted">
          {labelText}
          {field.required ? " *" : ""}
        </span>
        {multi && (
          <div className="flex items-center gap-1">
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
                aria-label={t("localeField")}
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
            <details className="relative">
              <summary
                aria-label={tp("translateField.menuLabel")}
                title={tp("translateField.menuLabel")}
                className={
                  "flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md border border-border text-foreground-muted hover:text-foreground " +
                  (sourceText === "" ? "pointer-events-none opacity-40" : "")
                }
              >
                {busy ? (
                  <Spinner />
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
                  {tp("translateField.all")}
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
                    {tp("translateField.one", { locale: l.toUpperCase() })}
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
      {isLong ? (
        <textarea
          rows={4}
          className={inputCls}
          value={text}
          aria-label={multi ? `${labelText} (${loc})` : labelText}
          onChange={(e) => setLocaleText(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className={inputCls}
          value={text}
          aria-label={multi ? `${labelText} (${loc})` : labelText}
          onChange={(e) => setLocaleText(e.target.value)}
        />
      )}
      {multi && loc !== defaultLocale && text === "" && sourceText !== "" && (
        <span className="text-[11px] text-foreground-muted">
          {tp("translateField.emptyHint", { locale: loc.toUpperCase() })}
        </span>
      )}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </fieldset>
  );
}

function Labelled({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-sm text-foreground-muted">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function asStr(v: FieldValue): string {
  return typeof v === "string" ? v : "";
}

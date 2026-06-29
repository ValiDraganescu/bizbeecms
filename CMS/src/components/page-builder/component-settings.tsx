"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  validateBlockProps,
  setLocalizedProp,
  localeFieldValue,
  collectTranslatableSource,
  mergeTranslations,
  type PropField,
} from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";
import { LocalePicker, useLocalePicker } from "./locale-picker";

/**
 * Right-rail Block tab when a COMPONENT block is selected — a settings form
 * auto-generated from the component's `propsSchema` (parsed via `parsePropsSchema`).
 *
 * One control per declared prop: text/textarea(richtext)/number/checkbox/select.
 * TRANSLATABLE string/richtext props (`translatable:true` in the schema) render
 * one input PER content locale (mirrors the SEO tab) and write a `{loc:text}`
 * object via `setLocalizedProp`; non-translatable / scalar props render a single
 * control. Every edit re-validates the full props through `validateBlockProps`
 * (the schema overload — type coercion + required-prop retention) and hands the
 * parent the persistable props; the existing top-bar Save writes them. All PURE
 * prop-merge logic lives in `page-blocks.ts` — never duplicated here.
 */
export function ComponentSettings({
  block,
  schema,
  locales,
  onChange,
}: {
  block: Block;
  schema: PropField[];
  locales: string[];
  onChange: (props: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const props = (block.props ?? {}) as Record<string, unknown>;
  const multi = locales.length > 1;
  const defaultLocale = locales[0];
  const picker = useLocalePicker(locales);
  const hasTranslatable = schema.some((f) => f.translatable);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const label = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const input =
    "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted";

  // Apply one field's new raw value, then re-validate the WHOLE props by schema so
  // types coerce and required props stay present.
  function setField(name: string, value: unknown) {
    onChange(validateBlockProps({ ...props, [name]: value }, schema));
  }
  function setLocalized(name: string, locale: string, value: string) {
    const current = props[name];
    setField(name, setLocalizedProp(current, locale, value, locales));
  }

  // "Translate with AI": collect every translatable prop's text in the ACTIVE
  // (source) locale, POST it to the shared /api/translate engine, then merge the
  // returned per-locale maps back into props for the user to review before Save.
  async function translateAll() {
    setTranslateError(null);
    const fields = collectTranslatableSource(props, schema, picker.active, defaultLocale);
    if (Object.keys(fields).length === 0) {
      setTranslateError(t("translate.empty"));
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "component",
          target: block.component,
          fields,
          fromLocale: picker.active,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        translations?: Record<string, Record<string, string>>;
        error?: string;
        errors?: string[];
      };
      if (!res.ok || !j.ok || !j.translations) {
        setTranslateError(j.error ?? j.errors?.join("; ") ?? `HTTP ${res.status}`);
        return;
      }
      onChange(mergeTranslations(props, j.translations, schema, locales));
    } catch (err) {
      setTranslateError((err as Error).message);
    } finally {
      setTranslating(false);
    }
  }

  if (schema.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-foreground">{block.component}</p>
        <p className="text-sm text-foreground-muted">{t("componentNoProps")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-sm text-foreground">{block.component}</p>
      {multi && hasTranslatable && (
        <div className="flex flex-col gap-2">
          <LocalePicker state={picker} label={t("localePickerLabel")} />
          <button
            type="button"
            disabled={translating}
            onClick={translateAll}
            className="self-start rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
          >
            {translating ? t("translate.busy") : t("translate.action")}
          </button>
          {translateError && (
            <p className="text-xs text-danger">{translateError}</p>
          )}
        </div>
      )}
      {schema.map((f) => {
        const raw = props[f.name];
        const labelText = f.label || f.name;
        return (
          <fieldset key={f.name} className="flex flex-col gap-1.5">
            <span className={label}>
              {labelText}
              {f.required && <span className="text-danger"> *</span>}
            </span>
            {f.description && (
              <span className="text-xs text-foreground-muted">{f.description}</span>
            )}

            {/* Translatable text → the active locale only (LocalePicker above). */}
            {f.translatable ? (
              (() => {
                const loc = picker.active;
                const value = localeFieldValue(raw, loc, defaultLocale);
                const aria = multi ? `${labelText} (${loc})` : labelText;
                return f.type === "richtext" ? (
                  <textarea
                    className={`${input} min-h-16`}
                    value={value}
                    placeholder={f.default}
                    aria-label={aria}
                    onChange={(e) => setLocalized(f.name, loc, e.target.value)}
                  />
                ) : (
                  <input
                    type="text"
                    className={input}
                    value={value}
                    placeholder={f.default}
                    aria-label={aria}
                    onChange={(e) => setLocalized(f.name, loc, e.target.value)}
                  />
                );
              })()
            ) : f.type === "select" ? (
              <select
                className={input}
                value={typeof raw === "string" ? raw : f.default}
                aria-label={labelText}
                onChange={(e) => setField(f.name, e.target.value)}
              >
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={raw === true || raw === "true"}
                  aria-label={labelText}
                  onChange={(e) => setField(f.name, e.target.checked)}
                />
                {labelText}
              </label>
            ) : f.type === "date" || f.type === "time" ? (
              <input
                type={f.type}
                className={input}
                value={typeof raw === "string" ? raw : f.default}
                aria-label={labelText}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            ) : f.type === "number" ? (
              <input
                type="number"
                className={input}
                value={typeof raw === "number" ? raw : f.default}
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) =>
                  setField(f.name, e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            ) : f.type === "richtext" ? (
              <textarea
                className={`${input} min-h-16`}
                value={typeof raw === "string" ? raw : ""}
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            ) : f.type === "json" ? (
              // Structured prop edited as JSON text; renderer serializes it into a
              // data-attribute for the component's client script to JSON.parse.
              <textarea
                className={`${input} min-h-24 font-mono`}
                value={
                  typeof raw === "string"
                    ? raw
                    : raw != null
                      ? JSON.stringify(raw, null, 2)
                      : f.default
                }
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            ) : (
              <input
                type="text"
                className={input}
                value={typeof raw === "string" ? raw : ""}
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

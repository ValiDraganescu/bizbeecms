"use client";

import { useTranslations } from "next-intl";
import {
  validateBlockProps,
  isImageProp,
  type PropField,
} from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";
import { ImagePicker } from "./image-picker";
import { TranslatableField } from "./translatable-field";

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

  const label = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const input =
    "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted";
  const segLabel = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const seg = "flex-1 rounded-md border px-2 py-1 text-sm transition-colors";
  const segOn = "border-primary bg-primary-subtle text-foreground font-medium";
  const segOff = "border-border text-foreground-muted hover:text-foreground";

  // Apply one field's new raw value, then re-validate the WHOLE props by schema so
  // types coerce and required props stay present (width is a reserved layout prop,
  // preserved through validation).
  function setField(name: string, value: unknown) {
    onChange(validateBlockProps({ ...props, [name]: value }, schema));
  }
  // Per-block layout width: fill the column vs wrap to content (default fill).
  const width: "fill" | "auto" = props.width === "auto" ? "auto" : "fill";
  function setWidth(w: "fill" | "auto") {
    onChange(validateBlockProps({ ...props, width: w }, schema));
  }

  // Width toggle (fill column vs wrap content) — shown for every component block.
  const widthControl = (
    <div className="flex flex-col gap-1.5">
      <span className={segLabel}>{t("blockWidth.label")}</span>
      <div className="flex gap-1">
        {(["fill", "auto"] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWidth(w)}
            aria-pressed={width === w}
            className={`${seg} ${width === w ? segOn : segOff}`}
          >
            {t(`blockWidth.${w}`)}
          </button>
        ))}
      </div>
    </div>
  );

  if (schema.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-mono text-sm text-foreground">{block.component}</p>
        {widthControl}
        <p className="text-sm text-foreground-muted">{t("componentNoProps")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-sm text-foreground">{block.component}</p>
      {widthControl}
      {schema.map((f) => {
        const raw = props[f.name];
        const labelText = f.label || f.name;

        // Translatable text → its own per-locale field (lang tabs + AI translate).
        if (f.translatable) {
          return (
            <TranslatableField
              key={f.name}
              field={f}
              block={block}
              props={props}
              locales={locales}
              onChange={onChange}
            />
          );
        }

        return (
          <fieldset key={f.name} className="flex flex-col gap-1.5">
            <span className={label}>
              {labelText}
              {f.required && <span className="text-danger"> *</span>}
            </span>
            {f.description && (
              <span className="text-xs text-foreground-muted">{f.description}</span>
            )}

            {isImageProp(f) ? (
              // Image prop (declared type:"image" or an image-ish name) → gallery
              // picker instead of a raw URL field. Stores the chosen /media URL.
              <ImagePicker
                value={typeof raw === "string" ? raw : ""}
                onChange={(url) => setField(f.name, url)}
              />
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

"use client";

/**
 * ONE declared prop rendered as a form field — the SINGLE type→widget mapping
 * shared by the Page Builder's ComponentSettings (block props) and the Develop
 * workbench's PropFields (placeholder defaults). Both editors previously kept a
 * hand-mirrored copy of this ladder and they drifted (new-tab default fallback,
 * long-text textarea heuristic); any new prop type or widget change lands HERE
 * and both editors pick it up.
 *
 * Renders the full fieldset (label, required mark, description, control). The
 * caller owns what the value MEANS (a block prop vs a schema default) and how it
 * persists; this component only maps `field.type` to the right input.
 */

import { useTranslations } from "next-intl";
import { isImageProp, isLinkProp, isLongText, type PropField } from "@/lib/pages/page-blocks";
import { ImagePicker } from "./image-picker";
import { IconPicker } from "./icon-picker";
import { LinkInput } from "./link-input";

const label = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
const input =
  "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-primary focus:outline-none";

export function PropFieldInput({
  field: f,
  value: raw,
  newTabValue,
  onValue,
  onNewTab,
}: {
  field: PropField;
  /** The prop's current raw value (block prop or edited default). */
  value: unknown;
  /** Link props: the companion `<name>NewTab` value; absent → the schema's `newTab` default. */
  newTabValue?: unknown;
  /** Fired with the prop's new value on every edit. */
  onValue: (value: unknown) => void;
  /** Link props: fired when the "open in new tab" toggle changes. */
  onNewTab?: (on: boolean) => void;
}) {
  const t = useTranslations("pageBuilder");
  const labelText = f.label || f.name;

  return (
    <fieldset className="flex flex-col gap-1.5">
      <span className={label}>
        {labelText}
        {f.required && <span className="text-danger"> *</span>}
      </span>
      {f.description && (
        <span className="text-xs text-foreground-muted">{f.description}</span>
      )}

      {f.type === "icon" ? (
        // Icon prop → searchable glyph picker (the Site's selected set). BEFORE
        // isImageProp so a prop named "icon" isn't grabbed by the image gallery.
        <IconPicker
          value={typeof raw === "string" ? raw : ""}
          onChange={(name) => onValue(name)}
        />
      ) : isImageProp(f) ? (
        // Image prop (declared type:"image" or an image-ish name) → gallery
        // picker instead of a raw URL field. Stores the chosen /media URL.
        <ImagePicker
          value={typeof raw === "string" ? raw : ""}
          onChange={(url) => onValue(url)}
        />
      ) : isLinkProp(f) ? (
        // Link prop (declared type:"link" or an href/url/link-ish name) → text +
        // page picker + "open in new tab". The toggle's value is the companion
        // `<name>NewTab` prop; absent it falls back to the schema's stored default.
        <LinkInput
          value={typeof raw === "string" ? raw : ""}
          onChange={(href) => onValue(href)}
          newTab={(newTabValue ?? f.newTab) === true}
          onNewTab={(on) => onNewTab?.(on)}
          ariaLabel={labelText}
          newTabLabel={t("link.newTab")}
          pickPageLabel={t("link.pickPage")}
        />
      ) : f.type === "select" ? (
        <select
          className={input}
          value={typeof raw === "string" ? raw : f.default}
          aria-label={labelText}
          onChange={(e) => onValue(e.target.value)}
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
            onChange={(e) => onValue(e.target.checked)}
          />
          {labelText}
        </label>
      ) : f.type === "date" || f.type === "time" ? (
        <input
          type={f.type}
          className={input}
          value={typeof raw === "string" ? raw : f.default}
          aria-label={labelText}
          onChange={(e) => onValue(e.target.value)}
        />
      ) : f.type === "number" ? (
        <input
          type="number"
          className={input}
          value={typeof raw === "number" ? raw : f.default}
          placeholder={f.default}
          aria-label={labelText}
          onChange={(e) => onValue(e.target.value === "" ? "" : Number(e.target.value))}
        />
      ) : f.type === "richtext" || isLongText(f.default) || isLongText(raw) ? (
        // Textarea for richtext, or any string prop whose default/value is long.
        <textarea
          className={`${input} min-h-16`}
          value={typeof raw === "string" ? raw : ""}
          placeholder={f.default}
          aria-label={labelText}
          onChange={(e) => onValue(e.target.value)}
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
          onChange={(e) => onValue(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className={input}
          value={typeof raw === "string" ? raw : ""}
          placeholder={f.default}
          aria-label={labelText}
          onChange={(e) => onValue(e.target.value)}
        />
      )}
    </fieldset>
  );
}

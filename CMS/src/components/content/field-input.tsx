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

import type { CollectionField } from "@/lib/content/collection-schema";
import { ImagePicker } from "@/components/page-builder/image-picker";

const INPUT =
  "rounded-md border border-border bg-surface px-3 py-2 text-foreground";

export type FieldValue = string | boolean | string[];

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

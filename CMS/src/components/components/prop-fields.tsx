"use client";

/**
 * A form that renders one input per declared prop, bound to a flat values map.
 *
 * Used by the Develop workbench's props sidebar to edit a component's PLACEHOLDER
 * defaults (the `default`s in its propsSchema). These defaults are scalar sample
 * values, so this is deliberately simpler than the Page Builder's ComponentSettings:
 * no per-locale inputs and no AI-translate (translatable only matters once a prop
 * is bound to real page content). Field rendering mirrors that component's inline
 * cases so the two editors look and behave the same.
 */

import type { PropField } from "@/lib/pages/page-blocks";

const input =
  "rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none";
const label = "text-sm font-medium text-foreground";

export function PropFields({
  schema,
  values,
  onChange,
}: {
  schema: PropField[];
  /** Current value per prop name (the edited defaults). */
  values: Record<string, unknown>;
  /** Fired with the prop name and its new value on every edit. */
  onChange: (name: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {schema.map((f) => {
        const raw = values[f.name];
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

            {f.type === "select" ? (
              <select
                className={input}
                value={typeof raw === "string" ? raw : f.default}
                aria-label={labelText}
                onChange={(e) => onChange(f.name, e.target.value)}
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
                  onChange={(e) => onChange(f.name, e.target.checked)}
                />
                {labelText}
              </label>
            ) : f.type === "date" || f.type === "time" ? (
              <input
                type={f.type}
                className={input}
                value={typeof raw === "string" ? raw : f.default}
                aria-label={labelText}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            ) : f.type === "number" ? (
              <input
                type="number"
                className={input}
                value={typeof raw === "number" ? raw : f.default}
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) =>
                  onChange(f.name, e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            ) : f.type === "richtext" ? (
              <textarea
                className={`${input} min-h-16`}
                value={typeof raw === "string" ? raw : ""}
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            ) : (
              <input
                type="text"
                className={input}
                value={typeof raw === "string" ? raw : ""}
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

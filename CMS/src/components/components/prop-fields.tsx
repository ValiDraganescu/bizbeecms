"use client";

/**
 * A form that renders one input per declared prop, bound to a flat values map.
 *
 * Used by the Develop workbench's props sidebar to edit a component's PLACEHOLDER
 * defaults (the `default`s in its propsSchema). Each field renders through the
 * SHARED `PropFieldInput` (the same type→widget mapping the Page Builder uses),
 * so the two editors can't drift. Simpler than ComponentSettings on purpose: no
 * per-locale inputs and no AI-translate (translatable only matters once a prop is
 * bound to real page content).
 */

import { linkNewTabProp, type PropField } from "@/lib/pages/page-blocks";
import { PropFieldInput } from "@/components/page-builder/prop-field-input";

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
      {schema.map((f) => (
        <PropFieldInput
          key={f.name}
          field={f}
          value={values[f.name]}
          newTabValue={values[linkNewTabProp(f.name)]}
          onValue={(v) => onChange(f.name, v)}
          onNewTab={(on) => onChange(linkNewTabProp(f.name), on)}
        />
      ))}
    </div>
  );
}

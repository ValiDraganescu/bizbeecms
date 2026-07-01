/**
 * Write edited PLACEHOLDER values back into a component's propsSchema JSON.
 *
 * The Develop props sidebar edits each prop's preview value; persisting it means
 * swapping that prop's `default` in the stored propsSchema while preserving every
 * other descriptor key (type, label, required, translatable, options, …). PURE —
 * no React/D1; node-testable like its peers (relative imports, no @/ alias).
 */

/**
 * Return a new propsSchema JSON string with each prop's `default` replaced by the
 * matching value in `values`. Props absent from `values` keep their stored
 * default; values for unknown props are ignored (the schema is the allowlist).
 * Booleans/numbers are stored as-is so parsePropsSchema round-trips their type.
 * Returns the original string unchanged if it can't be parsed as an object.
 */
import { linkNewTabProp } from "../pages/page-blocks.ts";

export function applyDefaults(
  propsSchema: string | null | undefined,
  values: Record<string, unknown>,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(propsSchema || "{}");
  } catch {
    return propsSchema ?? "{}";
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return propsSchema ?? "{}";
  }
  const schema = parsed as Record<string, Record<string, unknown>>;
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, specRaw] of Object.entries(schema)) {
    const spec =
      specRaw && typeof specRaw === "object" && !Array.isArray(specRaw)
        ? { ...specRaw }
        : {};
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      spec.default = values[name];
    }
    // A link prop's "open in new tab" toggle edits the companion `<name>NewTab`
    // value (not a declared prop) — persist it on the link prop's spec itself so
    // the schema allowlist doesn't drop it (parsePropsSchema reads it back).
    const flagKey = linkNewTabProp(name);
    if (Object.prototype.hasOwnProperty.call(values, flagKey)) {
      if (values[flagKey] === true) spec.newTab = true;
      else delete spec.newTab;
    }
    out[name] = spec;
  }
  return JSON.stringify(out);
}

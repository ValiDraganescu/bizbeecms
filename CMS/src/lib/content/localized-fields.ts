/**
 * translatable-collections — Slice 3: the ONE read-side parse seam (PURE, no I/O).
 *
 * A translatable text field (Slice 1) stores a per-locale "locale object" as JSON
 * in its existing TEXT column — `{"en":"Cosy bistro","fi":"Viihtyisä"}` — exactly
 * like `multiselect` stores a JSON array. On the WAY OUT of the store, every
 * translatable column on every row is parsed back into an object HERE, in a single
 * place (`queryCollection` + the item GET store), so ALL downstream readers see a
 * uniform shape:
 *   - the three field→prop copy sites (binding / plan-list / tree) hand the object
 *     straight into `resolveLocalized`, which picks the active content locale;
 *   - the admin item editor shows the per-locale values directly.
 *
 * Invariants (from the plan):
 *   - Only `isTranslatableField` columns are touched; everything else is copied
 *     through byte-for-byte.
 *   - A BARE STRING is a valid value (legacy / default-only) → left as-is;
 *     `resolveLocalized` is a no-op on a plain string, so it renders as the
 *     default locale.
 *   - Malformed / non-locale-object JSON → left as the original string. NEVER
 *     throws, so a bad row can never 500 a render.
 */
import { isTranslatableField, type CollectionField } from "./collection-schema.ts";
import { isLocaleObject } from "../render/localize.ts";

/**
 * Parse ONE stored column value for a translatable field. Returns:
 *  - the ORIGINAL value unchanged if it isn't a non-empty string (null/number/
 *    already-object all pass through);
 *  - the parsed object if the string is valid locale-object JSON;
 *  - the original string otherwise (bare string, or garbage JSON).
 * PURE, never throws.
 */
export function parseLocalizedValue(value: unknown): unknown {
  if (typeof value !== "string" || value === "") return value;
  // Fast reject: a locale-object JSON always starts with '{'. A bare string like
  // "Cosy bistro" is left untouched without paying a JSON.parse.
  if (value.charCodeAt(0) !== 0x7b /* { */) return value;
  try {
    const parsed = JSON.parse(value);
    return isLocaleObject(parsed) ? parsed : value;
  } catch {
    return value;
  }
}

/**
 * Parse every translatable column on a single row IN PLACE-SAFE fashion (returns a
 * NEW row object; never mutates the input). Non-translatable columns and columns
 * absent from `fields` are copied through unchanged. PURE.
 */
export function parseLocalizedRow<T extends Record<string, unknown>>(
  row: T,
  fields: CollectionField[],
): T {
  const translatable = fields.filter(isTranslatableField);
  if (translatable.length === 0) return row;
  const out: Record<string, unknown> = { ...row };
  for (const f of translatable) {
    if (f.name in out) out[f.name] = parseLocalizedValue(out[f.name]);
  }
  return out as T;
}

/** Parse translatable columns across many rows (list/query result). PURE. */
export function parseLocalizedRows<T extends Record<string, unknown>>(
  rows: T[],
  fields: CollectionField[],
): T[] {
  const translatable = fields.filter(isTranslatableField);
  if (translatable.length === 0) return rows;
  return rows.map((r) => parseLocalizedRow(r, fields));
}

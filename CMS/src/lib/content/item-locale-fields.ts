/**
 * translatable-collections — Slice 5: PURE helpers for the item editor's
 * per-locale text fields (no React, no I/O — node-testable).
 *
 * A translatable field's DRAFT value in the item editor is a locale object
 * `{ en, fi, … }` (or a bare string for a legacy/default-only value). These
 * helpers read/write one locale and merge an AI-translate response, reusing the
 * SAME pure primitives the page-builder translatable prop uses (`localeFieldValue`
 * / `setLocalizedProp`) so the two editors round-trip a value identically.
 */
import { localeFieldValue, setLocalizedProp } from "../pages/page-blocks.ts";

/** The draft shape a translatable field holds in the editor. */
export type LocalizedDraft = string | Record<string, string>;

/**
 * Normalize a loaded item value into the editor's draft shape for a translatable
 * field. The read seam already parses the column to a locale OBJECT (or leaves a
 * bare string); we keep that shape verbatim (bare string = default-only), so the
 * editor shows per-locale values directly. Non-string/object (null/number) → "".
 */
export function toLocalizedDraft(raw: unknown): LocalizedDraft {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, string>;
  }
  return "";
}

/** Read the text for one locale out of a draft value (bare string → default only). */
export function draftLocaleText(
  draft: LocalizedDraft,
  locale: string,
  defaultLocale: string,
): string {
  return localeFieldValue(draft, locale, defaultLocale);
}

/**
 * Write `text` for `locale` into a draft value, returning the next draft. Reuses
 * the page-builder collapse rule (drop empties, single-default → bare string) so
 * a simple value round-trips clean and matches the write-coerce contract.
 */
export function setDraftLocaleText(
  draft: LocalizedDraft,
  locale: string,
  text: string,
  locales: string[],
): LocalizedDraft {
  return setLocalizedProp(draft, locale, text, locales);
}

/**
 * Merge an `/api/translate` response (`{ field: { locale: text } }`) for THIS
 * field into a draft value. Only the entries for known locales with non-empty
 * text are applied; each goes through `setLocalizedProp` so the collapse rule
 * holds. `fieldName` selects this field's map out of the response.
 */
export function mergeItemTranslations(
  draft: LocalizedDraft,
  fieldName: string,
  translations: Record<string, Record<string, string>>,
  locales: string[],
): LocalizedDraft {
  const map = translations?.[fieldName];
  if (!map || typeof map !== "object") return draft;
  let next: LocalizedDraft = draft;
  for (const loc of locales) {
    const text = map[loc];
    if (typeof text !== "string" || text === "") continue;
    next = setLocalizedProp(next, loc, text, locales);
  }
  return next;
}

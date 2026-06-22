/**
 * Pure tag-label validation (pm-roles Slice 3b). Alias-free + side-effect-free so
 * it's directly importable from a bare `node --test` (see CAVEATS: tests can't
 * resolve `@/` aliases). DB-level uniqueness (the `tags_label_unique` index) is a
 * SEPARATE check the route does against the store; this only covers shape.
 */

export const TAG_LABEL_MAX = 50;

export type TagValidationError = "labelRequired" | "labelTooLong";

/**
 * Normalize a raw label (trim, collapse inner whitespace) and validate it.
 * Returns the cleaned label or a shape error key. Uniqueness is checked elsewhere.
 */
export function parseTagLabel(
  raw: unknown,
): { ok: true; label: string } | { ok: false; error: TagValidationError } {
  const label = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (label === "") return { ok: false, error: "labelRequired" };
  if (label.length > TAG_LABEL_MAX) return { ok: false, error: "labelTooLong" };
  return { ok: true, label };
}

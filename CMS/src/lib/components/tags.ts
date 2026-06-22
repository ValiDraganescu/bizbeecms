/**
 * Component tags (component-kits goal, Slice 1).
 *
 * Tags are free-form operator labels on a component (stored as a JSON string
 * array in the `component.tags` column) that drive kit-building: tag the
 * components, export the tag as a UI kit. These are COMPONENT tags inside one
 * CMS — NOT the PM/Site access tags (`pm-roles`), a separate concern.
 *
 * PURE (no React/D1/CF imports) so it's unit-tested with the dep-free node --test.
 * ponytail: a tags column + autocomplete from distinctTags is the whole machinery;
 * no managed tag table unless governance is actually needed.
 */

/** Per-tag length cap — labels are short. Keeps a bundle from smuggling a blob. */
const MAX_TAG_LEN = 40;
/** Per-component tag-count cap — sanity bound, not a product limit. */
const MAX_TAGS = 50;

/**
 * Normalize a raw tag list (from UI input, the DB column, or an import envelope)
 * into the canonical stored form: trim each, drop empties, drop over-long ones,
 * case-insensitively dedupe (keeping first spelling), cap the count, and sort.
 * PURE. Non-string entries are ignored, so an untrusted `["a", 1, null]` is safe.
 */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(); // lowercased, for dedupe
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || t.length > MAX_TAG_LEN) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Parse the DB `tags` JSON-string column to a normalized tag array. Never throws. */
export function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    return normalizeTags(JSON.parse(json));
  } catch {
    return [];
  }
}

/** Serialize a tag array to the canonical DB JSON string. */
export function serializeTags(tags: unknown): string {
  return JSON.stringify(normalizeTags(tags));
}

/**
 * The distinct, sorted set of tags across a list of components (for the admin
 * filter + add-tag autocomplete). Each component's `tags` may be a raw array or
 * already normalized. Case-insensitive dedupe across components. PURE.
 */
export function distinctTags(components: { tags?: unknown }[]): string[] {
  return normalizeTags(components.flatMap((c) => normalizeTags(c.tags)));
}

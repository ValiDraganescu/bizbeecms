/**
 * Pure, dependency-free slug helpers. Kept separate from `site.ts` (which pulls
 * in the D1/server data layer) so client components — e.g. the Site form, which
 * live-derives a slug from the name — can import them without dragging
 * server-only modules (`next/headers`, drizzle) into the browser bundle.
 */

/** Slug format: lowercase alphanumerics joined by single hyphens. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derive a URL-safe slug from a name: lowercase, ASCII-ish, runs of
 * spaces/punctuation collapsed to single hyphens, trimmed, length-capped. Used
 * to prefill the create form; the user may override it and the action
 * re-validates the final value.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 64 && SLUG_RE.test(slug);
}

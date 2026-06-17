/**
 * Pure slug-path resolution for the public page route (Milestone 2, epic A2).
 *
 * Kept PURE (no D1/React/CF imports) so it's unit-testable with dep-free
 * `node --test` (the project convention; see CAVEATS). The `[[...slug]]` route
 * supplies the URL segments; this normalizes them and the route walks the page
 * tree against `UNIQUE(parent_page_id, slug)`.
 *
 * Convention: the site root `/` (no URL segments) maps to a top-level page
 * (parentPageId = null) with the reserved HOME_SLUG. So a page authored with
 * slug "home" at the top level is what `/` serves. Deeper paths map 1:1 to the
 * parent→child slug chain (e.g. /blog/hello → ["blog","hello"]).
 */

/** The reserved slug a top-level page uses to serve the site root `/`. */
export const HOME_SLUG = "home";

/**
 * Normalize raw URL segments (Next's catch-all param, possibly undefined) into
 * the ordered slug chain to resolve against the page tree.
 *
 * - `undefined`/`[]` (the root `/`) → `[HOME_SLUG]`.
 * - Empty / whitespace-only segments are dropped (defensive against `//`).
 * - Each segment is URL-decoded.
 *
 * Returns `null` if, after normalization, there is no resolvable path AND it
 * wasn't the root (i.e. the URL was all-empty segments but not actually root —
 * shouldn't happen via Next, but guards manual callers).
 */
export function resolveSlugPath(segments: string[] | undefined): string[] {
  const raw = segments ?? [];
  const cleaned = raw
    .map((s) => safeDecode(s).trim())
    .filter((s) => s.length > 0);
  return cleaned.length === 0 ? [HOME_SLUG] : cleaned;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

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

/**
 * Locale-prefixed routes (path-locales-edge-cache Stage 1): peel a leading URL
 * segment that names a configured NON-default content locale. The default
 * locale stays UNPREFIXED (existing live URLs unchanged, and — critically — no
 * cookie may influence an unprefixed response, or default-locale pages become
 * uncacheable at the edge). `/fi/about` → locale "fi", rest ["about"];
 * `/about` → default locale, rest ["about"]; `/fi` → locale "fi", rest []
 * (which `resolveSlugPath` maps to HOME_SLUG, same as `/`). A leading segment
 * equal to the DEFAULT locale is NOT peeled — it resolves as an ordinary slug.
 * Matching is case-insensitive; the returned code is the stored one.
 */
export function peelLocaleSegment(
  segments: string[] | undefined,
  locales: string[],
  defaultLocale: string,
): { locale: string; rest: string[] } {
  const raw = segments ?? [];
  const first = raw.length > 0 ? safeDecode(raw[0]).trim().toLowerCase() : "";
  if (first !== "" && first !== defaultLocale.toLowerCase()) {
    const match = locales.find((code) => code.toLowerCase() === first);
    if (match) return { locale: match, rest: raw.slice(1) };
  }
  return { locale: defaultLocale, rest: raw };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Platform feature — dynamic/param-driven pages. A page slug prefixed with ":"
 * (e.g. ":city-slug") is a WILDCARD segment: it matches ANY concrete path
 * segment at that tree position, and the matched value is captured under the
 * name after the colon so blocks can read it as a route param (mirrors the
 * existing `{ prop }` api-param pattern — see lib/content/route-params.ts).
 * Kept here (not page-meta.ts) so the route walker + slug utilities share one
 * pure source with no D1/React import.
 */
export function isParamSlug(slug: string): boolean {
  return slug.startsWith(":") && slug.length > 1;
}

/** The captured param name for a wildcard slug (":city-slug" → "city-slug"). */
export function paramName(slug: string): string {
  return slug.slice(1);
}

/** A page row shape the pure matcher needs (real `Page` rows satisfy this). */
export interface SlugCandidate {
  slug: string;
  /**
   * Raw `page.localized_slugs` JSON text (locale → slug override), as stored.
   * Optional so plain fixtures / legacy callers don't need it.
   */
  localizedSlugs?: string | null;
}

/**
 * Stage 2 (localized slugs): the slug a page answers to in `locale` —
 * `localizedSlugs[locale] ?? slug`. Wildcard (":param") pages are
 * LOCALE-AGNOSTIC and always keep their default slug (validatePageMeta also
 * rejects wildcard override values). Override keys are stored lowercased, so
 * the locale is lowercased for the lookup. Malformed JSON / non-string /
 * empty override values fall back to the default slug (best-effort — a bad
 * stored map must never 404 the default chain).
 */
export function effectiveSlug(candidate: SlugCandidate, locale?: string): string {
  if (!locale || isParamSlug(candidate.slug)) return candidate.slug;
  const raw = candidate.localizedSlugs;
  if (!raw) return candidate.slug;
  try {
    const map: unknown = JSON.parse(raw);
    if (typeof map !== "object" || map === null) return candidate.slug;
    const v = (map as Record<string, unknown>)[locale.toLowerCase()];
    return typeof v === "string" && v.length > 0 ? v : candidate.slug;
  } catch {
    return candidate.slug;
  }
}

/**
 * Pick which SIBLING page matches one path segment: an EXACT slug match wins;
 * otherwise the first sibling whose slug is a WILDCARD (":name") matches, and
 * the concrete segment is the captured param value. Returns `null` if neither
 * matches. With `locale` (Stage 2), the exact match runs against the page's
 * EFFECTIVE slug in that locale (`localizedSlugs[locale] ?? slug`) — when an
 * override exists, ONLY the override matches (the default slug 404s in that
 * locale: one canonical URL per locale). PURE — the D1 fetch of `siblings`
 * stays in `resolvePage`; this is just the per-level decision, unit-tested in
 * isolation from D1.
 */
export function matchSlugSegment<T extends SlugCandidate>(
  siblings: T[],
  segment: string,
  locale?: string,
): { page: T; param?: { name: string; value: string } } | null {
  const exact = siblings.find((p) => effectiveSlug(p, locale) === segment);
  if (exact) return { page: exact };
  const wildcard = siblings.find((p) => isParamSlug(p.slug));
  if (!wildcard) return null;
  return { page: wildcard, param: { name: paramName(wildcard.slug), value: segment } };
}

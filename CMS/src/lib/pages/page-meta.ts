/**
 * Pure validation for the page-management admin UI (Milestone 2, epic C2) — the
 * NON-AI counterpart to the B3 `create_page` tool (`lib/chat/page-tool.ts`).
 *
 * The C2 UI authors page METADATA (slug, parent, publish status, per-locale SEO
 * title/description) — NOT the block tree (visual block editing is C3, and the
 * AI's create_page owns block authoring). So this validator deliberately omits
 * `blocks`: an edit preserves the page's existing tree, a create starts empty.
 *
 * PURE (no React / D1 / CF imports) so it's unit-tested with the dep-free
 * `node --test`. Relative `.ts` imports keep it node-loadable (see CAVEATS).
 */

export type PublishStatus = "draft" | "published";

/** Validated page metadata, ready to persist. */
export interface PageMetaInput {
  slug: string;
  parentSlug: string | null;
  publishStatus: PublishStatus;
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
  /** Per-locale OpenGraph image URL (R2 asset url). */
  metaImage: Record<string, string>;
  /**
   * Edge-cache max-age seconds (0 = never cache). OPTIONAL: absent means
   * "leave the stored value untouched" — SEO/publish bodies don't carry it,
   * so an SEO save must not silently reset a page's cache opt-in.
   */
  cacheMaxAge?: number;
  /**
   * Per-locale slug overrides (Stage 2 localized slugs), e.g. { fi: "meista" }.
   * `slug` stays the DEFAULT-locale slug; a missing key falls back to it.
   * OPTIONAL like cacheMaxAge: absent = preserve the stored map (SEO/publish
   * bodies don't carry it). Empty-string values clear an override.
   */
  localizedSlugs?: Record<string, string>;
}

/**
 * The page-settings "Edge cache" select options, in seconds:
 * Off / 5 minutes / 1 hour / 1 day. Single source for the UI select AND the
 * save-API validation — anything else is rejected.
 */
export const CACHE_MAX_AGE_OPTIONS = [0, 300, 3600, 86400] as const;

// Same slug grammar as the create_page tool: a lowercase URL segment. A leading
// ":" marks a WILDCARD param segment (e.g. ":city") — see lib/render/slug.ts —
// matching any path segment; its value is exposed to blocks as a route param.
export const SLUG_RE = /^:?[a-z0-9][a-z0-9-]{0,63}$/;

/** True if a (non-colon-stripped) slug is a wildcard param segment (":city"). */
export function isParamSlug(slug: string): boolean {
  return slug.startsWith(":");
}

/** True if `s` is a valid page slug. Exposed so the client can pre-validate. */
export function isValidSlug(s: unknown): s is string {
  return typeof s === "string" && SLUG_RE.test(s.trim());
}

/**
 * Validate a raw metadata object (from the admin form OR the REST body — both
 * untrusted) into a persistable `PageMetaInput`, or return the problems. PURE —
 * never throws, never writes. A page can't be its own parent (caller also guards
 * id-based cycles, which need the DB).
 */
export function validatePageMeta(
  args: unknown,
): { ok: true; meta: PageMetaInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return { ok: false, errors: ["page metadata must be a JSON object"] };
  }
  const a = args as Record<string, unknown>;

  const slug = typeof a.slug === "string" ? a.slug.trim() : "";
  if (!SLUG_RE.test(slug)) {
    errors.push("slug must be a lowercase URL segment (letters, digits, hyphens)");
  }

  let parentSlug: string | null = null;
  if (a.parentSlug != null && a.parentSlug !== "") {
    if (typeof a.parentSlug === "string" && SLUG_RE.test(a.parentSlug.trim())) {
      parentSlug = a.parentSlug.trim();
      if (parentSlug === slug) errors.push("a page cannot be its own parent");
    } else {
      errors.push("parent must be a lowercase URL segment, or empty for a top-level page");
    }
  }

  let publishStatus: PublishStatus = "draft";
  if (a.publishStatus != null) {
    if (a.publishStatus === "draft" || a.publishStatus === "published") {
      publishStatus = a.publishStatus;
    } else {
      errors.push("publishStatus must be 'draft' or 'published'");
    }
  }

  const metaTitle = coerceStringMap(a.metaTitle);
  if (metaTitle === undefined) errors.push("metaTitle must be a map of locale → string");
  const metaDescription = coerceStringMap(a.metaDescription);
  if (metaDescription === undefined) {
    errors.push("metaDescription must be a map of locale → string");
  }
  const metaImage = coerceStringMap(a.metaImage);
  if (metaImage === undefined) errors.push("metaImage must be a map of locale → string");

  let cacheMaxAge: number | undefined;
  if (a.cacheMaxAge != null) {
    if ((CACHE_MAX_AGE_OPTIONS as readonly number[]).includes(a.cacheMaxAge as number)) {
      cacheMaxAge = a.cacheMaxAge as number;
    } else {
      errors.push(`cacheMaxAge must be one of ${CACHE_MAX_AGE_OPTIONS.join(", ")} (seconds)`);
    }
  }

  let localizedSlugs: Record<string, string> | undefined;
  if (a.localizedSlugs != null) {
    const raw = coerceStringMap(a.localizedSlugs);
    if (raw === undefined) {
      errors.push("localizedSlugs must be a map of locale → slug string");
    } else {
      localizedSlugs = {};
      for (const [loc, value] of Object.entries(raw)) {
        const v = value.trim();
        if (v === "") continue; // empty clears the override → key dropped
        if (isParamSlug(v)) {
          errors.push(`localizedSlugs.${loc}: wildcard ":param" slugs are locale-agnostic — leave the localized slug empty`);
        } else if (!SLUG_RE.test(v)) {
          errors.push(`localizedSlugs.${loc} must be a lowercase URL segment (letters, digits, hyphens)`);
        } else {
          localizedSlugs[loc.toLowerCase()] = v;
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    meta: {
      slug,
      parentSlug,
      publishStatus,
      metaTitle: metaTitle as Record<string, string>,
      metaDescription: metaDescription as Record<string, string>,
      metaImage: metaImage as Record<string, string>,
      ...(cacheMaxAge !== undefined ? { cacheMaxAge } : {}),
      ...(localizedSlugs !== undefined ? { localizedSlugs } : {}),
    },
  };
}

/** The minimal slug identity of a page for per-locale sibling-uniqueness checks. */
export interface SiblingSlugSource {
  id: string;
  slug: string;
  localizedSlugs: Record<string, string>;
}

/**
 * Per-locale sibling-uniqueness check (Stage 2 localized slugs). A page's
 * EFFECTIVE slug in locale L is `localizedSlugs[L] ?? slug`; two siblings may
 * never share an effective slug in ANY locale or their URLs collide. Locales
 * checked = the union of keys across candidate + siblings (the default locale
 * is unkeyed and already guarded by UNIQUE(parent_page_id, slug)). The
 * candidate's own row (`id` match) is skipped. Returns the colliding
 * {locale, slug} pairs. PURE — no DB.
 */
export function localizedSlugSiblingConflicts(
  candidate: { id: string | null; slug: string; localizedSlugs: Record<string, string> },
  siblings: SiblingSlugSource[],
): { locale: string; slug: string }[] {
  const others = siblings.filter((s) => s.id !== candidate.id);
  const locales = new Set<string>(Object.keys(candidate.localizedSlugs));
  for (const s of others) for (const k of Object.keys(s.localizedSlugs)) locales.add(k);
  const conflicts: { locale: string; slug: string }[] = [];
  for (const loc of locales) {
    const mine = candidate.localizedSlugs[loc] ?? candidate.slug;
    for (const s of others) {
      if ((s.localizedSlugs[loc] ?? s.slug) === mine) {
        conflicts.push({ locale: loc, slug: mine });
        break;
      }
    }
  }
  return conflicts;
}

/** A sibling row as stored: `localized_slugs` is the raw TEXT JSON column. */
export interface RawSiblingSlugRow {
  id: string;
  slug: string;
  localizedSlugs: string | null;
}

/**
 * Create-path variant of `localizedSlugSiblingConflicts` for a NEW page (it
 * has no overrides of its own yet): its default slug can still collide with a
 * sibling's per-locale override — `UNIQUE(parent_page_id, slug)` only guards
 * the default locale. Takes the RAW stored `localized_slugs` JSON text
 * (malformed / non-object / empty values → treated as no overrides, matching
 * `effectiveSlug`'s fallback). PURE — no DB.
 */
export function newPageSiblingSlugConflicts(
  slug: string,
  siblings: RawSiblingSlugRow[],
): { locale: string; slug: string }[] {
  const parsed = siblings.map((s) => ({
    id: s.id,
    slug: s.slug,
    localizedSlugs: parseSlugMap(s.localizedSlugs),
  }));
  return localizedSlugSiblingConflicts({ id: null, slug, localizedSlugs: {} }, parsed);
}

function parseSlugMap(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const v: unknown = JSON.parse(json);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v))
      if (typeof val === "string" && val.trim() !== "") out[k] = val;
    return out;
  } catch {
    return {};
  }
}

/**
 * Set one content-locale's value in a locale→string map, immutably. Clearing a
 * value (empty/whitespace) drops the key so empty strings aren't persisted —
 * same convention the C2 pages-manager uses. PURE.
 */
export function setLocaleValue(
  map: Record<string, string>,
  loc: string,
  value: string,
): Record<string, string> {
  const next = { ...map };
  if (value.trim() === "") delete next[loc];
  else next[loc] = value;
  return next;
}

/**
 * Minimal page identity the SEO form needs to PUT a meta update without
 * touching slug/parent/publish (those keep their current values). Matches the
 * fields the page picker already holds for the selected page.
 */
export interface PageSeoSource {
  id: string;
  slug: string;
  parentSlug: string | null;
  publishStatus: string;
}

/**
 * Assemble the `PUT /api/pages` body for an SEO-only edit: keep the page's
 * existing slug/parent/publish, swap in the edited per-locale title/description
 * maps. The result is shaped for `validatePageMeta` (which the route re-runs).
 * PURE — no fetch, no DB.
 */
export function buildSeoMetaBody(
  page: PageSeoSource,
  metaTitle: Record<string, string>,
  metaDescription: Record<string, string>,
  metaImage: Record<string, string>,
): { id: string } & PageMetaInput {
  return {
    id: page.id,
    slug: page.slug,
    parentSlug: page.parentSlug,
    publishStatus: page.publishStatus === "published" ? "published" : "draft",
    metaTitle,
    metaDescription,
    metaImage,
  };
}

/**
 * Page identity + meta the Page tab needs to flip publish state without touching
 * the per-locale SEO maps. Superset of `PageSeoSource` — also carries the meta
 * maps so a publish toggle round-trips them unchanged (PageSummary satisfies it).
 */
export interface PagePublishSource extends PageSeoSource {
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
  metaImage: Record<string, string>;
}

/**
 * Assemble the `PUT /api/pages` body that flips a page draft↔published, keeping
 * slug/parent and all per-locale SEO maps untouched. PURE — no fetch, no DB.
 * Deliberately omits `cacheMaxAge` (absent = stored value preserved).
 */
export function buildPublishToggleBody(
  page: PagePublishSource,
): { id: string } & PageMetaInput {
  return {
    id: page.id,
    slug: page.slug,
    parentSlug: page.parentSlug,
    publishStatus: page.publishStatus === "published" ? "draft" : "published",
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    metaImage: page.metaImage,
  };
}

/**
 * Assemble the `PUT /api/pages` body that changes ONLY the per-locale slug
 * overrides (`localizedSlugs`), keeping publish state, slug/parent and all
 * per-locale SEO maps exactly as stored. Empty/whitespace values are dropped
 * client-side too so clearing an input clears the override. PURE.
 */
export function buildLocalizedSlugsBody(
  page: PagePublishSource,
  localizedSlugs: Record<string, string>,
): { id: string } & PageMetaInput {
  const cleaned: Record<string, string> = {};
  for (const [loc, v] of Object.entries(localizedSlugs)) {
    if (v.trim() !== "") cleaned[loc] = v.trim();
  }
  return {
    id: page.id,
    slug: page.slug,
    parentSlug: page.parentSlug,
    publishStatus: page.publishStatus === "published" ? "published" : "draft",
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    metaImage: page.metaImage,
    localizedSlugs: cleaned,
  };
}

/**
 * Assemble the `PUT /api/pages` body that changes ONLY the edge-cache opt-in
 * (`cacheMaxAge`), keeping publish state, slug/parent and all per-locale SEO
 * maps exactly as stored. PURE — no fetch, no DB.
 */
export function buildCacheMaxAgeBody(
  page: PagePublishSource,
  cacheMaxAge: number,
): { id: string } & PageMetaInput {
  return {
    id: page.id,
    slug: page.slug,
    parentSlug: page.parentSlug,
    publishStatus: page.publishStatus === "published" ? "published" : "draft",
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    metaImage: page.metaImage,
    cacheMaxAge,
  };
}

/** Object of string values (null/empty → {}); undefined if any value isn't a string. */
function coerceStringMap(raw: unknown): Record<string, string> | undefined {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") return undefined;
    out[k.trim()] = v;
  }
  return out;
}

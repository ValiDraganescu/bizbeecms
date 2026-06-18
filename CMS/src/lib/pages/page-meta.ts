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
}

// Same slug grammar as the create_page tool: a lowercase URL segment.
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

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

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    meta: {
      slug,
      parentSlug,
      publishStatus,
      metaTitle: metaTitle as Record<string, string>,
      metaDescription: metaDescription as Record<string, string>,
    },
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

/**
 * AI bulk-meta tools (seo-robots): let the assistant FIND pages/locales missing
 * a per-locale SEO title/description and WRITE generated values for them — the
 * chat-side pair for the read-only admin SEO-audit report.
 *
 * Two tools:
 *   - audit_meta    → run the SEO audit's missing-meta analysis and return the
 *                     page × locale gaps (reuses `auditSeo`'s `missingMeta`).
 *   - set_page_meta → write a per-locale metaTitle/metaDescription map onto ONE
 *                     page, MERGING into what's there (blank locales stay blank
 *                     unless supplied). Goes through the SAME `upsertPageMeta`
 *                     store path the REST SEO tab uses.
 *
 * This module is the PURE half (tool schemas + arg validation + the merge that
 * turns a patch into a persistable `PageMetaInput`) — no React/D1/CF imports so
 * it's covered by the dep-free `node --test` (see CAVEATS). The dispatcher wires
 * `audit_meta` to `listPagesForAudit()` + `auditSeo` and `set_page_meta` to a
 * `getPageById → upsertPageMeta` write plus the same purge/IndexNow hooks
 * `create_page` runs.
 *
 * SCOPE (deliberate): this writes ONLY metaTitle/metaDescription. It never
 * changes slug/parent/publishStatus (so it can't MOVE a page's URLs → no rename
 * 301 capture needed) and never touches noindex (preserve-when-absent) — exactly
 * why the lighter AI-hook path (purge tag + IndexNow ping, no rename/noindex
 * pre-capture) is correct here (see the AI write-path IndexNow caveat).
 */

// Relative imports keep this node-testable (see CAVEATS — no @/ / D1 / React).
import type { PageMetaInput, PublishStatus } from "../pages/page-meta.ts";

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

export const AUDIT_META_TOOL = {
  type: "function" as const,
  function: {
    name: "audit_meta",
    description:
      "List published pages that are missing a per-locale SEO meta title or " +
      "description. Call this FIRST to discover exactly which page × locale " +
      "pairs need meta, then write good values for each with set_page_meta. " +
      "Returns one finding per page × locale gap with the missing field(s).",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const SET_PAGE_META_TOOL = {
  type: "function" as const,
  function: {
    name: "set_page_meta",
    description:
      "Set a page's per-locale SEO meta title and/or description. Address the " +
      "page by its slug (use list_pages or audit_meta to find slugs). Pass " +
      "per-locale maps, e.g. metaTitle {\"en\":\"Pricing — Acme\"}. This MERGES: " +
      "locales you omit keep their current value; it only writes the locales you " +
      "supply. It does NOT change the page's URL, publish status, or noindex. " +
      "Write a concise, unique, human-sounding title (~50-60 chars) and " +
      "description (~140-160 chars) per locale.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The page's slug (top-level or child slug). 'home' is the site root.",
        },
        parentSlug: {
          type: "string",
          description:
            "The parent page's slug, if the target page is nested. Omit for a " +
            "top-level page. Needed to disambiguate a child slug reused under " +
            "different parents.",
        },
        metaTitle: {
          type: "object",
          description: "Per-locale SEO title map, e.g. { \"en\": \"Pricing\", \"fi\": \"Hinnat\" }.",
        },
        metaDescription: {
          type: "object",
          description: "Per-locale SEO description map, e.g. { \"en\": \"Simple pricing.\" }.",
        },
      },
      required: ["slug"],
    },
  },
} as const;

// ── Pure validation + merge ───────────────────────────────────────────────────

/** The validated set_page_meta patch: which page, and the per-locale text to set. */
export interface SetPageMetaPatch {
  slug: string;
  parentSlug: string | null;
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
}

const SLUG_RE = /^:?[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Validate a raw set_page_meta tool-call into a patch, or return the problems
 * (relayed back to the model). PURE — never throws, never writes. At least one
 * of metaTitle/metaDescription must carry a non-empty locale value, else the
 * call is a no-op and we tell the model so it doesn't loop.
 */
export function validateSetPageMeta(
  args: unknown,
): { ok: true; patch: SetPageMetaPatch } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return { ok: false, errors: ["tool arguments must be a JSON object"] };
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
    } else {
      errors.push("parentSlug must be a lowercase URL segment, or omitted for a top-level page");
    }
  }

  const metaTitle = coerceStringMap(a.metaTitle);
  if (metaTitle === undefined) errors.push("metaTitle must be a map of locale → string");
  const metaDescription = coerceStringMap(a.metaDescription);
  if (metaDescription === undefined) {
    errors.push("metaDescription must be a map of locale → string");
  }

  if (
    metaTitle !== undefined &&
    metaDescription !== undefined &&
    !hasNonEmpty(metaTitle) &&
    !hasNonEmpty(metaDescription)
  ) {
    errors.push(
      "provide at least one non-empty metaTitle or metaDescription locale value " +
        "(e.g. metaTitle {\"en\":\"…\"}) — nothing to write otherwise",
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    patch: {
      slug,
      parentSlug,
      metaTitle: metaTitle as Record<string, string>,
      metaDescription: metaDescription as Record<string, string>,
    },
  };
}

/** The current page fields the merge needs (a subset of PageSummary). */
export interface ExistingPageMeta {
  slug: string;
  parentSlug: string | null;
  publishStatus: string;
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
  metaImage: Record<string, string>;
}

/**
 * Build a persistable `PageMetaInput` from the page's CURRENT meta plus the
 * patch. MERGES the patch's locale values over the existing maps (an omitted
 * locale keeps its stored value; a supplied one overwrites). Passes slug /
 * parent / publishStatus / metaImage through UNCHANGED (this tool only edits
 * title+description) and OMITS noindex / localizedSlugs / cacheMaxAge so
 * upsertPageMeta's preserve-when-absent leaves them intact. PURE.
 *
 * NOTE: `metaImage` is NOT preserve-when-absent in upsertPageMeta (it always
 * writes `meta.metaImage`), so we MUST carry the existing map forward or a meta
 * edit would blank the page's OG image — hence it's a required existing field.
 */
export function mergePageMeta(existing: ExistingPageMeta, patch: SetPageMetaPatch): PageMetaInput {
  return {
    slug: existing.slug,
    parentSlug: existing.parentSlug,
    publishStatus: existing.publishStatus as PublishStatus,
    metaTitle: mergeLocaleMap(existing.metaTitle, patch.metaTitle),
    metaDescription: mergeLocaleMap(existing.metaDescription, patch.metaDescription),
    metaImage: existing.metaImage,
    // noindex / localizedSlugs / cacheMaxAge intentionally omitted → preserved.
  };
}

/** Merge patch locale values over base; an empty-string patch value CLEARS. */
function mergeLocaleMap(
  base: Record<string, string>,
  patch: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const [locale, val] of Object.entries(patch)) out[locale] = val;
  return out;
}

/** Accept an object of string values (or undefined/empty → {}); undefined if invalid. */
function coerceStringMap(raw: unknown): Record<string, string> | undefined {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val !== "string") return undefined;
    out[k] = val;
  }
  return out;
}

/** True if any locale key holds a non-blank value. */
function hasNonEmpty(map: Record<string, string>): boolean {
  return Object.values(map).some((v) => v.trim() !== "");
}

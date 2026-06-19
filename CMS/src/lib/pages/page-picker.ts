/**
 * Pure helpers for the page-builder top-bar page picker (epic: page-builder).
 *
 * The picker fetches `GET /api/pages` (a flat `PageSummary[]`) and needs to show
 * each page as a stable, human-readable option (its URL path) ordered parent →
 * child. This is the pure transform from the REST list to picker options, kept
 * dep-free (no React / D1 / next-intl) so it's unit-tested with `node --test`.
 *
 * Relative `.ts` import keeps it node-loadable (see CAVEATS). It deliberately
 * mirrors the path label `pages-manager.tsx` shows (`parentSlug/slug`, top-level
 * is just `/slug`) so the builder and the C2 manager stay visually consistent.
 */
import type { PageSummary } from "@/db/page-store";

export interface PageOption {
  id: string;
  slug: string;
  /** URL-ish label, e.g. "/about" or "/blog/post". */
  path: string;
  published: boolean;
}

/** "/about" for a top-level page, "/blog/post" for a child. */
export function pagePath(p: Pick<PageSummary, "slug" | "parentSlug">): string {
  return p.parentSlug ? `/${p.parentSlug}/${p.slug}` : `/${p.slug}`;
}

/**
 * Flatten the REST page list into picker options, ordered parent-first then by
 * path so children sit under their parent. `listPages()` already returns rows in
 * a sensible order, but the picker shouldn't depend on REST ordering — sort here.
 */
export function flattenPagesForPicker(pages: PageSummary[]): PageOption[] {
  return pages
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      path: pagePath(p),
      published: p.publishStatus === "published",
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Top-level pages (the only valid parents — one nesting level, mirrors the store). */
export function topLevelParents(pages: PageSummary[]): PageOption[] {
  return flattenPagesForPicker(pages.filter((p) => p.parentPageId === null));
}

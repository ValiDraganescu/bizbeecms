/**
 * Pure helper for the branded-404 setting (seo-robots — designated 404 page).
 *
 * `notFoundPageOptions` turns page rows into the operator's select options:
 * PUBLISHED pages only (you can't point the 404 at a draft), each labelled by
 * its default-locale meta title, falling back to the URL path when a title is
 * missing. Dep-free (no D1/React/CF) so it runs under `node --test`.
 */

export interface NotFoundPageRow {
  id: string;
  slug: string;
  parentSlug: string | null;
  publishStatus: string;
  /** Per-locale meta title map (default-locale key preferred for the label). */
  metaTitle: Record<string, string>;
}

export interface NotFoundPageOption {
  id: string;
  label: string;
}

/**
 * Build the select options for the 404-page picker. `defaultLocale` chooses
 * which meta title to show; when that title is empty we fall back to any title,
 * then to the page's path (`/parent/slug`).
 */
export function notFoundPageOptions(
  pages: NotFoundPageRow[],
  defaultLocale = "en",
): NotFoundPageOption[] {
  return pages
    .filter((p) => p.publishStatus === "published")
    .map((p) => ({ id: p.id, label: labelFor(p, defaultLocale) }));
}

function labelFor(p: NotFoundPageRow, defaultLocale: string): string {
  const titles = p.metaTitle ?? {};
  const preferred = titles[defaultLocale]?.trim();
  if (preferred) return preferred;
  const anyTitle = Object.values(titles)
    .map((t) => t?.trim())
    .find((t) => t);
  if (anyTitle) return anyTitle;
  const path = p.parentSlug ? `/${p.parentSlug}/${p.slug}` : `/${p.slug}`;
  return path;
}

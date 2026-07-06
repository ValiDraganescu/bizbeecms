/**
 * Published-page URL enumeration for the public sitemap
 * (path-locales-edge-cache Stage 1 — SEO slice).
 *
 * Turns the flat `page` table into the list of enumerable published paths:
 * walk each published row's parent chain to build its slug segments. Skipped:
 * - chains containing a WILDCARD `:param` slug (no enumerable URL — the
 *   concrete values live in operator data, not the page tree);
 * - rows with a dangling `parentPageId` (unreachable via the tree walk);
 * - cycles (defensive — the UI prevents them, imports might not).
 * The top-level HOME_SLUG page maps to the root `[]` (served at `/`), matching
 * `resolveSlugPath`. Only the LEAF's publish status gates inclusion — same as
 * `resolvePage`, where an unpublished ancestor still routes to a published
 * child.
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 */

import { HOME_SLUG, isParamSlug } from "./slug.ts";

/** The columns the enumeration needs (real `Page` rows satisfy this). */
export interface SitemapPageRow {
  id: string;
  slug: string;
  parentPageId: string | null;
  publishStatus: string;
  updatedAt?: Date | null;
}

/** Every published page's locale-free slug segments + last-modified stamp. */
export function publishedPagePaths(
  rows: SitemapPageRow[],
): Array<{ segments: string[]; lastModified?: Date }> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: Array<{ segments: string[]; lastModified?: Date }> = [];

  for (const row of rows) {
    if (row.publishStatus !== "published") continue;

    const segments: string[] = [];
    const seen = new Set<string>();
    let cur: SitemapPageRow | undefined = row;
    let ok = true;
    while (cur) {
      if (seen.has(cur.id) || isParamSlug(cur.slug)) {
        ok = false;
        break;
      }
      seen.add(cur.id);
      segments.unshift(cur.slug);
      if (cur.parentPageId === null) break;
      cur = byId.get(cur.parentPageId);
      if (!cur) {
        ok = false; // dangling parent — the tree walk can't reach this page
        break;
      }
    }
    if (!ok) continue;

    out.push({
      segments:
        segments.length === 1 && segments[0] === HOME_SLUG ? [] : segments,
      lastModified: row.updatedAt ?? undefined,
    });
  }
  return out;
}

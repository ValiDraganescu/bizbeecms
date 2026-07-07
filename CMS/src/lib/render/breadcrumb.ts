/**
 * Auto BreadcrumbList JSON-LD (seo-robots goal).
 *
 * Emits a schema.org `BreadcrumbList` structured-data script for a published
 * page from its ancestor chain (root → current leaf). Pages at depth 0 (the
 * site root / a top-level page) get no breadcrumb — a single-item list is noise
 * and Google ignores it.
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`. The
 * caller (render-page's buildPlanFromPage) feeds it the ancestor chain built
 * from the already-loaded page rows (per-locale meta titles + reverse-resolved
 * localized paths via pagePathsByLocale — both visitor-independent stored data,
 * safe on the edge-cached (site) render path).
 */

import { escapeJsonForScript } from "./jsonld-component.ts";

/** One breadcrumb hop: the visible name + the item's URL (absolute preferred). */
export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** Minimal page-row shape the ancestor walk needs. */
export interface BreadcrumbPageRow {
  id: string;
  parentPageId: string | null;
}

/**
 * The ordered ancestor chain (root → leaf) of `pageId` as `{ id }[]`. Cycle- and
 * dangling-parent-safe: returns `null` if the chain can't be fully resolved
 * (rather than a partial, misleading trail). Depth is the returned length − 1.
 * PURE.
 */
export function ancestorChain(
  rows: BreadcrumbPageRow[],
  pageId: string,
): BreadcrumbPageRow[] | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain: BreadcrumbPageRow[] = [];
  const seen = new Set<string>();
  let cur = byId.get(pageId);
  if (!cur) return null;
  while (cur) {
    if (seen.has(cur.id)) return null; // cycle
    seen.add(cur.id);
    chain.unshift(cur);
    if (cur.parentPageId === null) break;
    cur = byId.get(cur.parentPageId);
    if (!cur) return null; // dangling parent
  }
  return chain;
}

/**
 * Build the escaped BreadcrumbList JSON payload (the INNER text of an
 * `application/ld+json` script), or `null` when there's nothing worth emitting:
 * - fewer than 2 items (a single-hop / root page — no breadcrumb),
 * - any item missing a name or url after trimming (an incomplete chain would
 *   emit a malformed trail — skip rather than lie).
 *
 * `ListItem.position` is 1-based per schema.org. Names/urls are carried by
 * JSON.stringify (quote/escape safe) then `<`/`>`/`&`-escaped so the string is
 * safe to drop directly inside an inline `<script>`.
 */
export function buildBreadcrumbData(items: BreadcrumbItem[]): string | null {
  const clean = items
    .map((it) => ({ name: it.name?.trim() ?? "", url: it.url?.trim() ?? "" }))
    .filter((it) => it.name !== "" && it.url !== "");
  if (clean.length !== items.length || clean.length < 2) return null;

  const payload = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: clean.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
  return escapeJsonForScript(JSON.stringify(payload));
}

/**
 * The full `<script type="application/ld+json">…</script>` element string for a
 * page's BreadcrumbList, or `null` when `buildBreadcrumbData` has nothing to
 * emit. For callers that render into an HTML string; React callers use
 * `buildBreadcrumbData` directly (they own the `<script>` element).
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): string | null {
  const json = buildBreadcrumbData(items);
  return json === null ? null : `<script type="application/ld+json">${json}</script>`;
}

/**
 * Public sitemap (path-locales-edge-cache Stage 1 — SEO slice).
 *
 * Serves /sitemap.xml: every PUBLISHED page × every configured content locale
 * (default locale unprefixed, others /<code>/…), with per-entry hreflang
 * alternates when the site has more than one locale. Wildcard `:param` pages
 * have no enumerable URLs and are skipped (see lib/render/sitemap-paths.ts).
 * Requires a known public origin (APP_ORIGIN, deployer-injected) — sitemap
 * URLs must be absolute, so an unknown origin yields an empty sitemap rather
 * than wrong hosts.
 */
import type { MetadataRoute } from "next";
import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import { getContentLocales } from "@/db/settings-store";
import { publishedPagePaths } from "@/lib/render/sitemap-paths";
import { pathForLocale } from "@/lib/render/hreflang";
import { createPathTranslator } from "@/lib/render/localize-paths";
import { resolveSiteOrigin } from "@/lib/render/site-origin";

// Reads per-request D1 — never prerender at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await resolveSiteOrigin();
  if (!origin) return [];

  const db = await getDb();
  const [rows, contentLocales] = await Promise.all([
    db
      .select({
        id: pageTable.id,
        slug: pageTable.slug,
        parentPageId: pageTable.parentPageId,
        localizedSlugs: pageTable.localizedSlugs,
        publishStatus: pageTable.publishStatus,
        noindex: pageTable.noindex,
        updatedAt: pageTable.updatedAt,
      })
      .from(pageTable),
    getContentLocales(db),
  ]);

  const codes = contentLocales.locales;
  // Stage 2 (localized slugs): non-default locale URLs emit each page's
  // translated slug chain — segments from publishedPagePaths are the DEFAULT
  // chain, exactly what the translator matches on.
  const translate = createPathTranslator(rows, contentLocales.default);
  const entries: MetadataRoute.Sitemap = [];
  for (const page of publishedPagePaths(rows)) {
    // hreflang alternates once per page, shared by all its locale entries.
    const languages =
      codes.length > 1
        ? Object.fromEntries(
            codes.map((code) => [
              code,
              origin +
                pathForLocale(page.segments, code, contentLocales.default, translate),
            ]),
          )
        : undefined;
    for (const code of codes) {
      entries.push({
        url:
          origin +
          pathForLocale(page.segments, code, contentLocales.default, translate),
        lastModified: page.lastModified,
        ...(languages ? { alternates: { languages } } : {}),
      });
    }
  }
  return entries.sort((a, b) => a.url.localeCompare(b.url));
}

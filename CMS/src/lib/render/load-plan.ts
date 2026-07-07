/**
 * Published-page render-plan loading for the public `[[...slug]]` route.
 *
 * Split from `resolve-page.ts` (path-locales-edge-cache): `loadPlan` pulls the
 * full render stack (React via `render-page`, next-intl, next/headers) which
 * must NOT be bundled into the custom edge-cache worker entrypoint
 * (`CMS/worker.ts`). The worker imports only the lean `resolve-page.ts`
 * (slug walk over D1); this module owns everything after page resolution.
 */
import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { page as pageTable, type Page } from "@/db/schema";
import { resolvePage, type RouteParams } from "@/lib/render/resolve-page";
import { resolveSlugPath, peelLocaleSegment } from "@/lib/render/slug";
import { buildPlanFromPage } from "@/lib/render/render-page";
import { getContentLocales } from "@/db/settings-store";
import { getVersion } from "@/db/page-version-store";
import { pickRenderBlocks } from "@/lib/pages/page-version";
import type { RouteContext } from "@/lib/content/route-params";

export type { RouteParams };

const EMPTY_ROUTE_CONTEXT: RouteContext = { params: {}, query: {} };

/**
 * Shared tail of loadPlan / loadPlanById: pick the published version's blocks
 * and build the render plan in the active locale. `routeNotFound` collapses to
 * a null return (a route-driven binding matched nothing).
 */
async function planForPage(
  pageRow: Page,
  activeLocale: string,
  routeContext: RouteContext,
) {
  // Versioning slice 2: render the PUBLISHED version's blocks; legacy pages
  // (no version rows) fall back to `page.blocks`. The publish gate already ran
  // before we get here, so an un-versioned published page still renders.
  const published = await getVersion(pageRow.publishedVersionId);
  const blocks = pickRenderBlocks(published, null, pageRow.blocks);
  const { plan, locale, routeNotFound } = await buildPlanFromPage(
    pageRow,
    blocks,
    false,
    routeContext,
    activeLocale,
  );
  // A route-driven binding (e.g. `:city-slug`'s hero) matched zero rows: the
  // segment names something that doesn't exist (bad city/offer/restaurant
  // slug) — 404 instead of silently rendering the component's static
  // defaults, which reads as real (wrong) content. See BACKLOG "unmatched
  // wildcard slugs render WRONG content".
  if (routeNotFound) return null;
  return { page: pageRow, plan, locale };
}

/** Load the page + its render plan, or null if no published page matches. */
export async function loadPlan(params: RouteParams, query: Record<string, string>) {
  const db = await getDb();
  // Stage 1 (path-locales-edge-cache): the URL alone determines the locale.
  // A leading NON-default content-locale segment is peeled off before the tree
  // walk; the default locale stays unprefixed. No cookie may influence this —
  // cookie-dependent responses would make default-locale URLs uncacheable.
  const contentLocales = await getContentLocales(db);
  const { locale: activeLocale, rest } = peelLocaleSegment(
    params.slug,
    contentLocales.locales,
    contentLocales.default,
  );
  const path = resolveSlugPath(rest);
  const resolved = await resolvePage(db, path, activeLocale);
  if (!resolved) return null;
  return planForPage(resolved.page, activeLocale, {
    params: resolved.params,
    query,
  });
}

/**
 * Load a SPECIFIC published page's plan by id, rendered in `activeLocale`
 * (seo-robots — branded 404). Used by the catch-all's miss path to render the
 * operator-designated 404 page. Returns null if the page is missing or not
 * published (deleted/unpublished target → caller falls back to the plain 404).
 * No route params: the 404 page can't be wildcard/route-bound, so a static
 * branded page has an empty route context.
 */
export async function loadPlanById(pageId: string, activeLocale: string) {
  if (!pageId) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(pageTable)
    .where(eq(pageTable.id, pageId))
    .limit(1);
  const pageRow = rows[0];
  if (!pageRow || pageRow.publishStatus !== "published") return null;
  return planForPage(pageRow, activeLocale, EMPTY_ROUTE_CONTEXT);
}

/**
 * Peel the active content locale from the request slug WITHOUT resolving a page
 * — used by the catch-all's 404 path so the branded 404 renders in the locale
 * the visitor asked for (`/fi/missing` → 404 in fi). Same peel the render path
 * uses, so the locale is consistent.
 */
export async function peelActiveLocale(params: RouteParams): Promise<string> {
  const db = await getDb();
  const contentLocales = await getContentLocales(db);
  const { locale } = peelLocaleSegment(
    params.slug,
    contentLocales.locales,
    contentLocales.default,
  );
  return locale;
}

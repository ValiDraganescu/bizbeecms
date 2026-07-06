/**
 * Shared slug → page → render-plan resolution for published pages.
 *
 * Extracted from `app/[[...slug]]/page.tsx` so the route stays a thin caller
 * and the custom worker cache entrypoint (path-locales-edge-cache goal) can
 * reuse `resolvePage` to look up a page's id/cache settings without going
 * through Next. NOT dep-free (imports D1/Drizzle) — logic that needs unit
 * tests lives in `slug.ts` (`matchSlugSegment`, `resolveSlugPath`).
 */
import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import type { Page } from "@/db/schema";
import { resolveSlugPath, matchSlugSegment, peelLocaleSegment } from "@/lib/render/slug";
import { buildPlanFromPage } from "@/lib/render/render-page";
import { getContentLocales } from "@/db/settings-store";
import { getVersion } from "@/db/page-version-store";
import { pickRenderBlocks } from "@/lib/pages/page-version";
import type { RouteContext } from "@/lib/content/route-params";

export type RouteParams = { slug?: string[] };

/**
 * Resolve a slug chain to the published leaf page by walking the parent/child
 * tree (UNIQUE(parent_page_id, slug)). Platform feature — dynamic/param-driven
 * pages: at each level, an EXACT slug match wins; if none exists, a sibling
 * whose slug is a WILDCARD (":name", see lib/render/slug.ts) matches instead
 * and the concrete path segment is captured under that param name. Returns the
 * leaf page row + captured params, or null if any segment is unmatched or the
 * leaf isn't published.
 */
export async function resolvePage(
  db: Awaited<ReturnType<typeof getDb>>,
  path: string[],
): Promise<{ page: Page; params: Record<string, string> } | null> {
  let parentId: string | null = null;
  let current: Page | null = null;
  const params: Record<string, string> = {};

  for (const segment of path) {
    const siblings = await db
      .select()
      .from(pageTable)
      .where(
        parentId === null
          ? isNull(pageTable.parentPageId)
          : eq(pageTable.parentPageId, parentId),
      );
    const match = matchSlugSegment(siblings, segment);
    if (!match) return null;
    current = match.page;
    if (match.param) params[match.param.name] = match.param.value;
    parentId = current.id;
  }

  if (!current || current.publishStatus !== "published") return null;
  return { page: current, params };
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
  const resolved = await resolvePage(db, path);
  if (!resolved) return null;
  const { page: pageRow, params: routeParams } = resolved;
  // Versioning slice 2: render the PUBLISHED version's blocks; legacy pages
  // (no version rows) fall back to `page.blocks`. The publish gate already
  // ran in resolvePage, so an un-versioned published page still renders.
  const published = await getVersion(pageRow.publishedVersionId);
  const blocks = pickRenderBlocks(published, null, pageRow.blocks);
  const routeContext: RouteContext = { params: routeParams, query };
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

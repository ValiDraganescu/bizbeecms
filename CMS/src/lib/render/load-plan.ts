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
import { resolvePage, type RouteParams } from "@/lib/render/resolve-page";
import { resolveSlugPath, peelLocaleSegment } from "@/lib/render/slug";
import { buildPlanFromPage } from "@/lib/render/render-page";
import { getContentLocales } from "@/db/settings-store";
import { getVersion } from "@/db/page-version-store";
import { pickRenderBlocks } from "@/lib/pages/page-version";
import type { RouteContext } from "@/lib/content/route-params";

export type { RouteParams };

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

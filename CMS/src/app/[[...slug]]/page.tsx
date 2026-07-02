/**
 * Public page route (Milestone 2, epic A2 — productionizes the /test proof).
 *
 * A catch-all that loads a published page from the per-Site D1, walks its block
 * tree against the component library, SSRs each component's `tree` via
 * React.createElement (a DATA WALK — never eval/Function, banned on Workers),
 * and ships each used component's client `script` as a <script> the BROWSER
 * runs. The pure walker is `lib/render/tree.ts`; slug resolution is
 * `lib/render/slug.ts` (both dep-free, unit-tested).
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import type { Page } from "@/db/schema";
import { type LocaleContext, parseJsonColumn } from "@/lib/render/tree";
import { resolveSlugPath, matchSlugSegment } from "@/lib/render/slug";
import { resolveLocalized } from "@/lib/render/localize";
import { buildPlanFromPage, RenderedPage } from "@/lib/render/render-page";
import { getVersion } from "@/db/page-version-store";
import { pickRenderBlocks } from "@/lib/pages/page-version";
import type { RouteContext } from "@/lib/content/route-params";

type RouteParams = { slug?: string[] };

/**
 * Resolve a slug chain to the published leaf page by walking the parent/child
 * tree (UNIQUE(parent_page_id, slug)). Platform feature — dynamic/param-driven
 * pages: at each level, an EXACT slug match wins; if none exists, a sibling
 * whose slug is a WILDCARD (":name", see lib/render/slug.ts) matches instead
 * and the concrete path segment is captured under that param name. Returns the
 * leaf page row + captured params, or null if any segment is unmatched or the
 * leaf isn't published.
 */
async function resolvePage(
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
async function loadPlan(params: RouteParams, query: Record<string, string>) {
  const db = await getDb();
  const path = resolveSlugPath(params.slug);
  const resolved = await resolvePage(db, path);
  if (!resolved) return null;
  const { page: pageRow, params: routeParams } = resolved;
  // Versioning slice 2: render the PUBLISHED version's blocks; legacy pages
  // (no version rows) fall back to `page.blocks`. The publish gate already
  // ran in resolvePage, so an un-versioned published page still renders.
  const published = await getVersion(pageRow.publishedVersionId);
  const blocks = pickRenderBlocks(published, null, pageRow.blocks);
  const routeContext: RouteContext = { params: routeParams, query };
  const { plan, locale, routeNotFound } = await buildPlanFromPage(pageRow, blocks, false, routeContext);
  // A route-driven binding (e.g. `:city-slug`'s hero) matched zero rows: the
  // segment names something that doesn't exist (bad city/offer/restaurant
  // slug) — 404 instead of silently rendering the component's static
  // defaults, which reads as real (wrong) content. See BACKLOG "unmatched
  // wildcard slugs render WRONG content".
  if (routeNotFound) return null;
  return { page: pageRow, plan, locale };
}

/** Resolve a per-locale JSON map (e.g. metaTitle) to the active locale w/ fallback. */
function localized(raw: string, locale: LocaleContext): string | undefined {
  const map = parseJsonColumn<unknown>(raw, {});
  const resolved = resolveLocalized(map, locale.locale, locale.fallback);
  return typeof resolved === "string" && resolved !== "" ? resolved : undefined;
}

/** Next's searchParams promise is `?key=value|value[]|undefined` — flatten to
 * the first value per key (the query-param feature only needs single values,
 * mirroring RouteContext.query). */
function flattenSearchParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && typeof v[0] === "string") out[k] = v[0];
  }
  return out;
}

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const loaded = await loadPlan(await params, flattenSearchParams(await searchParams));
  if (!loaded) return {};
  const title = localized(loaded.page.metaTitle, loaded.locale);
  const description = localized(loaded.page.metaDescription, loaded.locale);
  const image = localized(loaded.page.metaImage, loaded.locale);
  return {
    title,
    description,
    // OpenGraph image, resolved per active locale (falls back like title/desc).
    openGraph: image ? { images: [{ url: image }] } : undefined,
  };
}

export default async function PublicPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}) {
  const loaded = await loadPlan(await params, flattenSearchParams(await searchParams));
  if (!loaded) notFound();
  // Identical render to the admin draft-preview route — see lib/render/render-page.
  return <RenderedPage plan={loaded.plan} />;
}

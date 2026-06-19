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
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import type { Page } from "@/db/schema";
import { type LocaleContext, parseJsonColumn } from "@/lib/render/tree";
import { resolveSlugPath } from "@/lib/render/slug";
import { resolveLocalized } from "@/lib/render/localize";
import { buildPlanFromPage, RenderedPage } from "@/lib/render/render-page";
import { getVersion } from "@/db/page-version-store";
import { pickRenderBlocks } from "@/lib/pages/page-version";

type RouteParams = { slug?: string[] };

/**
 * Resolve a slug chain to the published leaf page by walking the parent/child
 * tree (UNIQUE(parent_page_id, slug)). Returns the leaf page row or null if any
 * segment is missing or the leaf isn't published.
 */
async function resolvePage(
  db: Awaited<ReturnType<typeof getDb>>,
  path: string[],
): Promise<Page | null> {
  let parentId: string | null = null;
  let current: Page | null = null;

  for (const slug of path) {
    const where: SQL | undefined =
      parentId === null
        ? and(isNull(pageTable.parentPageId), eq(pageTable.slug, slug))
        : and(eq(pageTable.parentPageId, parentId), eq(pageTable.slug, slug));
    const rows = await db.select().from(pageTable).where(where).limit(1);
    current = rows[0] ?? null;
    if (!current) return null;
    parentId = current.id;
  }

  if (!current || current.publishStatus !== "published") return null;
  return current;
}

/** Load the page + its render plan, or null if no published page matches. */
async function loadPlan(params: RouteParams) {
  const db = await getDb();
  const path = resolveSlugPath(params.slug);
  const pageRow = await resolvePage(db, path);
  if (!pageRow) return null;
  // Versioning slice 2: render the PUBLISHED version's blocks; legacy pages
  // (no version rows) fall back to `page.blocks`. The publish gate already
  // ran in resolvePage, so an un-versioned published page still renders.
  const published = await getVersion(pageRow.publishedVersionId);
  const blocks = pickRenderBlocks(published, null, pageRow.blocks);
  const { plan, locale } = await buildPlanFromPage(pageRow, blocks);
  return { page: pageRow, plan, locale };
}

/** Resolve a per-locale JSON map (e.g. metaTitle) to the active locale w/ fallback. */
function localized(raw: string, locale: LocaleContext): string | undefined {
  const map = parseJsonColumn<unknown>(raw, {});
  const resolved = resolveLocalized(map, locale.locale, locale.fallback);
  return typeof resolved === "string" && resolved !== "" ? resolved : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const loaded = await loadPlan(await params);
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
}: {
  params: Promise<RouteParams>;
}) {
  const loaded = await loadPlan(await params);
  if (!loaded) notFound();
  // Identical render to the admin draft-preview route — see lib/render/render-page.
  return <RenderedPage plan={loaded.plan} />;
}

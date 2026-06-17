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
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { getDb } from "@/db";
import { component as componentTable, page as pageTable } from "@/db/schema";
import type { Page } from "@/db/schema";
import {
  type Block,
  type ComponentArtifact,
  type TreeNode,
  parseJsonColumn,
  planPage,
} from "@/lib/render/tree";
import { renderPlans } from "@/lib/render/react";
import { resolveSlugPath } from "@/lib/render/slug";
import { generateUtilityCss } from "@/lib/render/utility-css";

// Precompiled once per worker instance — pure, deterministic, bounded vocabulary.
const UTILITY_CSS = generateUtilityCss();

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

/** Collect every component name referenced anywhere in a block tree. */
function collectComponentNames(blocks: Block[], into: Set<string>): void {
  for (const b of blocks) {
    if (b?.component) into.add(b.component);
    if (b?.children?.length) collectComponentNames(b.children, into);
  }
}

/** Load the page + its render plan, or null if no published page matches. */
async function loadPlan(params: RouteParams) {
  const db = await getDb();
  const path = resolveSlugPath(params.slug);
  const pageRow = await resolvePage(db, path);
  if (!pageRow) return null;

  const blocks = parseJsonColumn<Block[]>(pageRow.blocks, []);

  const names = new Set<string>();
  collectComponentNames(blocks, names);

  const components = new Map<string, ComponentArtifact>();
  if (names.size > 0) {
    const rows = await db
      .select()
      .from(componentTable)
      .where(inArray(componentTable.name, [...names]));
    for (const row of rows) {
      components.set(row.name, {
        name: row.name,
        tree: parseJsonColumn<TreeNode>(row.tree, ""),
        script: row.script || undefined,
      });
    }
  }

  const plan = planPage(blocks, components);
  return { page: pageRow, plan };
}

/** Resolve a per-locale JSON map (e.g. metaTitle) to the active locale w/ fallback. */
function localized(raw: string, locale: string): string | undefined {
  const map = parseJsonColumn<Record<string, string>>(raw, {});
  return map[locale] ?? map.en ?? Object.values(map)[0];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const loaded = await loadPlan(await params);
  if (!loaded) return {};
  const locale = await getLocale();
  return {
    title: localized(loaded.page.metaTitle, locale),
    description: localized(loaded.page.metaDescription, locale),
  };
}

export default async function PublicPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const loaded = await loadPlan(await params);
  if (!loaded) notFound();

  const { plan } = loaded;
  return (
    <>
      {/*
        Precompiled utility sheet (epic A3). The build-time Tailwind scanner
        never sees runtime artifact `className`s (they live in D1), so we ship a
        bounded, AI-allowed utility vocabulary inline here. Inline <style> = part
        of the SSR'd HTML, so it needs no static-asset upload (sidesteps the open
        ASSETS deploy gap). See lib/render/utility-css.ts.
      */}
      <style dangerouslySetInnerHTML={{ __html: UTILITY_CSS }} />
      {renderPlans(plan.root)}
      {/*
        Ship each used component's AI-authored client script to the browser.
        The server forwards it as text; the browser executes it. The
        dangerouslySetInnerHTML here is "this is a <script>", NOT user data —
        end-user data is never interpolated into `script` (see GOAL.md security
        boundary).
      */}
      {plan.scripts.map((s, i) => (
        <script key={i} dangerouslySetInnerHTML={{ __html: s }} />
      ))}
    </>
  );
}

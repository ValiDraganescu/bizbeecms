/**
 * Shared slug → published-page resolution.
 *
 * Extracted from `app/[[...slug]]/page.tsx` so the route stays a thin caller
 * and the custom worker cache entrypoint (`CMS/worker.ts`) can reuse
 * `resolvePage` to look up a page's id/cache settings without going through
 * Next. DELIBERATELY LEAN: only drizzle + the pure slug helpers — the worker
 * entrypoint bundles this module, so it must never import React/next-intl/
 * next/headers (those live in `load-plan.ts`, the Next-route side of the
 * split). NOT dep-free (imports D1/Drizzle) — logic that needs unit tests
 * lives in `slug.ts` (`matchSlugSegment`, `resolveSlugPath`).
 */
import { eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/ports/db";
import { page as pageTable } from "@/db/schema";
import type { Page } from "@/db/schema";
import { matchSlugSegment } from "@/lib/render/slug";

export type RouteParams = { slug?: string[] };

/**
 * Resolve a slug chain to the published leaf page by walking the parent/child
 * tree (UNIQUE(parent_page_id, slug)). Platform feature — dynamic/param-driven
 * pages: at each level, an EXACT slug match wins; if none exists, a sibling
 * whose slug is a WILDCARD (":name", see lib/render/slug.ts) matches instead
 * and the concrete path segment is captured under that param name. Returns the
 * leaf page row + captured params, or null if any segment is unmatched or the
 * leaf isn't published.
 *
 * Stage 2 (localized slugs): pass the ACTIVE locale (from `peelLocaleSegment`)
 * and each level matches the page's effective slug in that locale
 * (`localizedSlugs[locale] ?? slug`); omitted = default-slug walk.
 */
export async function resolvePage(
  db: Db,
  path: string[],
  locale?: string,
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
    const match = matchSlugSegment(siblings, segment, locale);
    if (!match) return null;
    current = match.page;
    if (match.param) params[match.param.name] = match.param.value;
    parentId = current.id;
  }

  if (!current || current.publishStatus !== "published") return null;
  return { page: current, params };
}

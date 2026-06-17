/**
 * D1 persistence for the create/compose-page tool (Milestone 2, epic B3).
 *
 * Thin write layer over the `page` table (A1), mirroring `component-store.ts`.
 * The input has already been SHAPE-validated by `validatePageInput` (pure, in
 * lib/chat); this module does the parts that need the binding:
 *
 *  - verify the referenced components exist (`missingComponents`),
 *  - resolve `parentSlug` → `parentPageId`,
 *  - upsert by UNIQUE(parent_page_id, slug).
 *
 * Build-verified only: the live D1 read/write needs a real binding (HITL).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "./index";
import type { PageInput } from "@/lib/chat/page-tool";

/** Return the subset of `names` that have no matching `component.name` in D1. */
export async function missingComponents(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ name: schema.component.name })
    .from(schema.component)
    .where(inArray(schema.component.name, names));
  const present = new Set(rows.map((r) => r.name));
  return names.filter((n) => !present.has(n));
}

/**
 * Insert or update a page by (parentPageId, slug). Resolves `parentSlug` to its
 * page id (a missing parent is reported, not silently dropped — a child under a
 * nonexistent parent would be unreachable). Returns the action + final slug.
 */
export async function upsertPage(
  page: PageInput,
): Promise<
  | { ok: true; action: "created" | "updated"; slug: string }
  | { ok: false; errors: string[] }
> {
  const db = await getDb();
  const now = new Date();

  // Resolve parent slug → id (top-level parents only; one level of lookup).
  let parentPageId: string | null = null;
  if (page.parentSlug !== null) {
    const parent = await db
      .select({ id: schema.page.id })
      .from(schema.page)
      .where(
        and(eq(schema.page.slug, page.parentSlug), isNull(schema.page.parentPageId)),
      )
      .limit(1);
    if (parent.length === 0) {
      return { ok: false, errors: [`parent page "${page.parentSlug}" not found`] };
    }
    parentPageId = parent[0].id;
  }

  const blocks = JSON.stringify(page.blocks);
  const metaTitle = JSON.stringify(page.metaTitle);
  const metaDescription = JSON.stringify(page.metaDescription);

  // Existing page at this (parent, slug)?
  const parentMatch =
    parentPageId === null
      ? isNull(schema.page.parentPageId)
      : eq(schema.page.parentPageId, parentPageId);
  const existing = await db
    .select({ id: schema.page.id })
    .from(schema.page)
    .where(and(eq(schema.page.slug, page.slug), parentMatch))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.page)
      .set({
        publishStatus: page.publishStatus,
        blocks,
        metaTitle,
        metaDescription,
        updatedAt: now,
      })
      .where(eq(schema.page.id, existing[0].id));
    return { ok: true, action: "updated", slug: page.slug };
  }

  await db.insert(schema.page).values({
    id: crypto.randomUUID(),
    slug: page.slug,
    parentPageId,
    publishStatus: page.publishStatus,
    blocks,
    metaTitle,
    metaDescription,
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, action: "created", slug: page.slug };
}

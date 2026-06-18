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
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "./index";
import type { PageInput } from "@/lib/chat/page-tool";
import type { PageMetaInput } from "@/lib/pages/page-meta";
import { parseJsonColumn, type Block } from "@/lib/render/tree";
import type { Page } from "./schema";

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

// ── C2 page-management UI (non-AI authoring of page metadata) ────────────────

/** A page row for the admin list/editor (blocks omitted — C3 edits those). */
export interface PageSummary {
  id: string;
  slug: string;
  parentPageId: string | null;
  parentSlug: string | null;
  publishStatus: string;
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
  updatedAt: number;
}

function parseMap(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
      return out;
    }
  } catch {
    /* corrupt JSON → empty map */
  }
  return {};
}

function toSummary(row: Page, idToSlug: Map<string, string>): PageSummary {
  return {
    id: row.id,
    slug: row.slug,
    parentPageId: row.parentPageId,
    parentSlug: row.parentPageId ? idToSlug.get(row.parentPageId) ?? null : null,
    publishStatus: row.publishStatus,
    metaTitle: parseMap(row.metaTitle),
    metaDescription: parseMap(row.metaDescription),
    updatedAt: row.updatedAt.getTime(),
  };
}

/** List all pages (parent slug resolved) ordered by parent then displayOrder/slug. */
export async function listPages(): Promise<PageSummary[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.page)
    .orderBy(asc(schema.page.parentPageId), asc(schema.page.displayOrder), asc(schema.page.slug));
  const idToSlug = new Map(rows.map((r) => [r.id, r.slug]));
  return rows.map((r) => toSummary(r, idToSlug));
}

/** One page by id, or null. */
export async function getPageById(id: string): Promise<PageSummary | null> {
  const db = await getDb();
  const rows = await db.select().from(schema.page).where(eq(schema.page.id, id)).limit(1);
  if (rows.length === 0) return null;
  const idToSlug = new Map<string, string>();
  if (rows[0].parentPageId) {
    const p = await db
      .select({ id: schema.page.id, slug: schema.page.slug })
      .from(schema.page)
      .where(eq(schema.page.id, rows[0].parentPageId))
      .limit(1);
    if (p.length) idToSlug.set(p[0].id, p[0].slug);
  }
  return toSummary(rows[0], idToSlug);
}

/**
 * Create a page from metadata (empty block tree) OR update the metadata of an
 * existing page (`id` set) WITHOUT touching its blocks. Resolves `parentSlug`,
 * enforces UNIQUE(parent, slug), and rejects parent cycles. Shape already
 * validated by `validatePageMeta`.
 */
export async function upsertPageMeta(
  meta: PageMetaInput,
  id: string | null,
): Promise<{ ok: true; id: string; action: "created" | "updated" } | { ok: false; errors: string[] }> {
  const db = await getDb();
  const now = new Date();

  // Resolve parent slug → id (top-level parent; one lookup level, mirrors upsertPage).
  let parentPageId: string | null = null;
  if (meta.parentSlug !== null) {
    const parent = await db
      .select({ id: schema.page.id })
      .from(schema.page)
      .where(and(eq(schema.page.slug, meta.parentSlug), isNull(schema.page.parentPageId)))
      .limit(1);
    if (parent.length === 0) {
      return { ok: false, errors: [`parent page "${meta.parentSlug}" not found`] };
    }
    parentPageId = parent[0].id;
    if (id !== null && parentPageId === id) {
      return { ok: false, errors: ["a page cannot be its own parent"] };
    }
  }

  const metaTitle = JSON.stringify(meta.metaTitle);
  const metaDescription = JSON.stringify(meta.metaDescription);

  // Guard the UNIQUE(parent, slug) before writing so we report a friendly error.
  const parentMatch =
    parentPageId === null
      ? isNull(schema.page.parentPageId)
      : eq(schema.page.parentPageId, parentPageId);
  const clash = await db
    .select({ id: schema.page.id })
    .from(schema.page)
    .where(and(eq(schema.page.slug, meta.slug), parentMatch))
    .limit(1);
  if (clash.length > 0 && clash[0].id !== id) {
    return { ok: false, errors: [`a sibling page already uses slug "${meta.slug}"`] };
  }

  if (id !== null) {
    const existing = await db
      .select({ id: schema.page.id })
      .from(schema.page)
      .where(eq(schema.page.id, id))
      .limit(1);
    if (existing.length === 0) return { ok: false, errors: ["page not found"] };
    await db
      .update(schema.page)
      .set({
        slug: meta.slug,
        parentPageId,
        publishStatus: meta.publishStatus,
        metaTitle,
        metaDescription,
        updatedAt: now,
      })
      .where(eq(schema.page.id, id));
    return { ok: true, id, action: "updated" };
  }

  const newId = crypto.randomUUID();
  await db.insert(schema.page).values({
    id: newId,
    slug: meta.slug,
    parentPageId,
    publishStatus: meta.publishStatus,
    blocks: "[]",
    metaTitle,
    metaDescription,
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, id: newId, action: "created" };
}

// ── C3 block-tree editing (non-AI visual compose/reorder) ────────────────────

/**
 * Read one page's block tree for the visual editor (C3). Returns the page slug
 * (for the header) + its parsed blocks, or null if the page is gone. Distinct
 * read for C3 since `getPageById`/`PageSummary` deliberately omit blocks.
 */
export async function getPageBlocks(
  id: string,
): Promise<{ id: string; slug: string; blocks: Block[] } | null> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.page.id, slug: schema.page.slug, blocks: schema.page.blocks })
    .from(schema.page)
    .where(eq(schema.page.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    slug: rows[0].slug,
    blocks: parseJsonColumn<Block[]>(rows[0].blocks, []),
  };
}

/**
 * Persist a page's block tree (C3) WITHOUT touching its metadata — the inverse
 * of `upsertPageMeta` (which preserves blocks). This is C3's dedicated write
 * contract; do NOT route block edits through upsertPageMeta or the AI's
 * `upsertPage`. Blocks are already shape-validated by `validateBlocks` (pure);
 * the caller verifies referenced components exist. Returns ok or "page not found".
 */
export async function setPageBlocks(
  id: string,
  blocks: Block[],
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const db = await getDb();
  const existing = await db
    .select({ id: schema.page.id })
    .from(schema.page)
    .where(eq(schema.page.id, id))
    .limit(1);
  if (existing.length === 0) return { ok: false, errors: ["page not found"] };
  await db
    .update(schema.page)
    .set({ blocks: JSON.stringify(blocks), updatedAt: new Date() })
    .where(eq(schema.page.id, id));
  return { ok: true };
}

/** List the Site's component names for the C3 block palette (sorted). */
export async function listComponentNamesForPalette(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ name: schema.component.name }).from(schema.component);
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));
}

/** Delete a page. Refuses if it still has children (avoid orphaning the tree). */
export async function deletePage(
  id: string,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const db = await getDb();
  const children = await db
    .select({ id: schema.page.id })
    .from(schema.page)
    .where(eq(schema.page.parentPageId, id))
    .limit(1);
  if (children.length > 0) {
    return { ok: false, errors: ["delete or reparent this page's child pages first"] };
  }
  await db.delete(schema.page).where(eq(schema.page.id, id));
  return { ok: true };
}

/**
 * D1 persistence for PAGE VERSIONING (slice 1) — the thin store wrappers around
 * the pure transition algebra in `lib/pages/page-version.ts`.
 *
 * Slice 1 is DATA ONLY — no routes, no UI. These functions load `page_version`
 * rows + the `page` pointers, call the pure planners, stamp ids/timestamps, and
 * write. The existing `page.blocks`/`publishStatus` columns stay authoritative
 * for readers until later slices migrate them — these functions are additive.
 *
 * Build-verified only: the live D1 read/write needs a real binding (HITL).
 */
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import {
  applyDraftEdit,
  planDraftFrom,
  planPublish,
  planRestore,
  type VersionRecord,
  type VersionSeed,
} from "../lib/pages/page-version.ts";
import type { PageVersion } from "./schema.ts";

/** Map a drizzle row → the pure `VersionRecord` shape (timestamps to numbers). */
function toRecord(row: PageVersion): VersionRecord {
  return {
    id: row.id,
    pageId: row.pageId,
    blocks: row.blocks,
    meta: row.meta,
    status: row.status,
    versionNo: row.versionNo,
    createdAt: row.createdAt.getTime(),
  };
}

/** Insert a planned version record (the planner omits id/createdAt). Returns the new id. */
async function insertVersion(
  db: Db,
  rec: Omit<VersionRecord, "id" | "createdAt">,
  now: Date,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(schema.pageVersion).values({
    id,
    pageId: rec.pageId,
    blocks: rec.blocks,
    meta: rec.meta,
    status: rec.status,
    versionNo: rec.versionNo,
    createdAt: now,
  });
  return id;
}

async function loadVersion(db: Db, id: string): Promise<VersionRecord | null> {
  const rows = await db
    .select()
    .from(schema.pageVersion)
    .where(eq(schema.pageVersion.id, id))
    .limit(1);
  return rows.length ? toRecord(rows[0]) : null;
}

/**
 * Load a single version record by id (or null). Public read for the render
 * routes (Versioning slice 2): a route holds the page's `draftVersionId` /
 * `publishedVersionId` pointer and resolves it to the row to render. Does NOT
 * create anything (unlike `getDraft`) — a dangling pointer just yields null and
 * the route falls back per `pickRenderBlocks`.
 */
export async function getVersion(id: string | null, injectedDb?: Db): Promise<VersionRecord | null> {
  if (!id) return null;
  const db = injectedDb ?? (await getDb());
  return loadVersion(db, id);
}

/**
 * The page's current draft version, creating one if absent. A page with no
 * draft yet seeds one from its published version (if any) else empty, and
 * points `page.draft_version_id` at it. Returns the draft record.
 */
export async function getDraft(pageId: string, injectedDb?: Db): Promise<VersionRecord | null> {
  const db = injectedDb ?? (await getDb());
  const pageRows = await db
    .select({
      id: schema.page.id,
      draftVersionId: schema.page.draftVersionId,
      publishedVersionId: schema.page.publishedVersionId,
    })
    .from(schema.page)
    .where(eq(schema.page.id, pageId))
    .limit(1);
  if (pageRows.length === 0) return null;
  const { draftVersionId, publishedVersionId } = pageRows[0];

  if (draftVersionId) {
    const existing = await loadVersion(db, draftVersionId);
    if (existing) return existing;
    // pointer dangles (deleted row) → fall through and recreate.
  }

  const source = publishedVersionId ? await loadVersion(db, publishedVersionId) : null;
  const { record } = planDraftFrom(pageId, source);
  const now = new Date();
  const id = await insertVersion(db, record, now);
  await db.update(schema.page).set({ draftVersionId: id, updatedAt: now }).where(eq(schema.page.id, pageId));
  return { ...record, id, createdAt: now.getTime() };
}

/**
 * Overwrite the draft version's blocks + meta (NO publish). Creates the draft
 * first if absent. `seed.blocks`/`seed.meta` are JSON strings (caller serializes
 * after `validateBlocks`). Returns the updated draft.
 */
export async function saveDraftBlocks(
  pageId: string,
  seed: VersionSeed,
  injectedDb?: Db,
): Promise<VersionRecord | null> {
  const db = injectedDb ?? (await getDb());
  const draft = await getDraft(pageId, db);
  if (!draft) return null;
  const next = applyDraftEdit(draft, seed);
  await db
    .update(schema.pageVersion)
    .set({ blocks: next.blocks, meta: next.meta })
    .where(eq(schema.pageVersion.id, draft.id));
  return next;
}

/** All versions for a page, newest first (history list). */
export async function listVersions(pageId: string, injectedDb?: Db): Promise<VersionRecord[]> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select()
    .from(schema.pageVersion)
    .where(eq(schema.pageVersion.pageId, pageId))
    .orderBy(desc(schema.pageVersion.createdAt));
  return rows.map(toRecord);
}

async function allVersions(db: Db, pageId: string): Promise<VersionRecord[]> {
  const rows = await db
    .select()
    .from(schema.pageVersion)
    .where(eq(schema.pageVersion.pageId, pageId))
    .orderBy(asc(schema.pageVersion.createdAt));
  return rows.map(toRecord);
}

/**
 * Publish the current draft: snapshot it into a new PUBLISHED version (bumping
 * `version_no`), point `page.published_version_id` at it, then auto-create a
 * fresh draft copied from the just-published snapshot and point
 * `page.draft_version_id` at THAT (so editing continues — REFINED behavior 3).
 * Returns the new published + auto-draft records.
 */
export async function publishDraft(
  pageId: string,
  injectedDb?: Db,
): Promise<{ published: VersionRecord; draft: VersionRecord } | null> {
  const db = injectedDb ?? (await getDb());
  const draft = await getDraft(pageId, db);
  if (!draft) return null;

  const versions = await allVersions(db, pageId);
  const plan = planPublish(draft, versions);
  const now = new Date();

  const publishedId = await insertVersion(db, plan.published, now);
  const draftId = await insertVersion(db, plan.autoDraft, now);
  await db
    .update(schema.page)
    .set({ publishedVersionId: publishedId, draftVersionId: draftId, updatedAt: now })
    .where(eq(schema.page.id, pageId));

  return {
    published: { ...plan.published, id: publishedId, createdAt: now.getTime() },
    draft: { ...plan.autoDraft, id: draftId, createdAt: now.getTime() },
  };
}

/**
 * Restore a past version: copy it into a NEW draft (source untouched) and point
 * `page.draft_version_id` at the new draft. Returns the new draft record.
 */
export async function newDraftFromVersion(
  pageId: string,
  versionId: string,
  injectedDb?: Db,
): Promise<VersionRecord | null> {
  const db = injectedDb ?? (await getDb());
  const src = await loadVersion(db, versionId);
  if (!src || src.pageId !== pageId) return null;
  const { record } = planRestore(src);
  const now = new Date();
  const id = await insertVersion(db, record, now);
  await db.update(schema.page).set({ draftVersionId: id, updatedAt: now }).where(eq(schema.page.id, pageId));
  return { ...record, id, createdAt: now.getTime() };
}

// Re-export the pure types for callers (slices 2-4) to avoid a deep import.
export type { VersionRecord, VersionSeed };

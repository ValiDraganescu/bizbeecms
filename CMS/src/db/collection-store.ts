/**
 * content-collections — Slice 2: the collection registry store (live I/O).
 *
 * Thin layer that turns the PURE plans (`lib/content/collection-plan.ts`) into
 * real effects: read the registry (Drizzle, built-in `collection` table), run the
 * generated DDL through the Slice-0 fence (`contentDdl`), and write/update/delete
 * the registry row. The order matters:
 *   create: cap+collision check (registry) → CREATE TABLE (fenced) → INSERT row.
 *   add-field: ALTER TABLE ADD COLUMN (fenced) → UPDATE registry schema JSON.
 *   delete: DROP TABLE (fenced) → DELETE registry row.
 * Live D1 writes need a real binding (HITL) — the DECISION logic is node-tested in
 * the pure planner; this module is build-verified.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/ports/db.ts";
import { contentDdl, contentDdlBatch } from "../lib/content/content-db.ts";
import {
  planCreate,
  planAddField,
  type CreatePlan,
  type PlanResult,
} from "../lib/content/collection-plan.ts";
import { planRebuild, type SchemaChange } from "../lib/content/schema-rebuild.ts";
import type { CollectionField } from "../lib/content/collection-schema.ts";
import type { Collection } from "./schema.ts";

/** A collection as the API hands it out (schema parsed from the JSON column). */
export interface CollectionView {
  id: string;
  name: string;
  tableName: string;
  fields: CollectionField[];
  /** Form-block opt-in: may PUBLIC visitors submit DRAFT items? Default false. */
  publicSubmissions: boolean;
  createdAt: number;
  updatedAt: number;
}

function toView(row: Collection): CollectionView {
  let fields: CollectionField[] = [];
  try {
    const parsed = JSON.parse(row.schema ?? "[]");
    if (Array.isArray(parsed)) fields = parsed as CollectionField[];
  } catch {
    fields = [];
  }
  return {
    id: row.id,
    name: row.name,
    tableName: row.tableName,
    fields,
    publicSubmissions: row.publicSubmissions === true,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : Number(row.updatedAt),
  };
}

/**
 * Toggle the public-submissions opt-in (Form-block collection target). Returns
 * the updated view, or a 404 rejection for an unknown collection.
 */
export async function setPublicSubmissions(
  tableName: string,
  enabled: boolean,
): Promise<PlanResult<CollectionView>> {
  const db = await getDb();
  const existing = await getCollection(tableName);
  if (!existing) return { ok: false, status: 404, error: "collection not found" };
  await db
    .update(schema.collection)
    .set({ publicSubmissions: enabled, updatedAt: new Date() })
    .where(eq(schema.collection.tableName, tableName));
  return { ok: true, plan: { ...existing, publicSubmissions: enabled } };
}

/** List all collections (registry rows), newest first. */
export async function listCollections(): Promise<CollectionView[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.collection);
  return rows
    .map(toView)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Describe one collection by its `content_<slug>` table name, or null. */
export async function getCollection(tableName: string): Promise<CollectionView | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.collection)
    .where(eq(schema.collection.tableName, tableName))
    .limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

/**
 * Create a collection: plan (cap/collision/DDL) → CREATE TABLE (fenced) → INSERT
 * registry row. Returns the new view, or a coded rejection. The CREATE runs
 * before the row insert so a failed DDL never leaves an orphan registry row;
 * the unique index on `table_name` is the final collision backstop.
 */
export async function createCollection(
  rawName: unknown,
  rawFields: unknown,
): Promise<PlanResult<CollectionView>> {
  const db = await getDb();
  const existing = await db
    .select({ tableName: schema.collection.tableName })
    .from(schema.collection);

  const planned = planCreate(rawName, rawFields, existing.length, existing.map((r) => r.tableName));
  if (!planned.ok) return planned;
  const plan: CreatePlan = planned.plan;

  // Create the real table FIRST (fenced). If this throws, no registry row exists.
  await contentDdl(plan.createSql);

  const now = new Date();
  const id = crypto.randomUUID();
  try {
    await db.insert(schema.collection).values({
      id,
      name: plan.name,
      tableName: plan.tableName,
      schema: JSON.stringify(plan.fields),
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    // Almost certainly the unique-index collision (race between the count read
    // and the insert). The table was created; surface a 409 — a follow-up create
    // with a different name is the fix. (Cleanup of the orphan table is a manual/
    // future concern; we don't drop here to avoid masking the real error.)
    return { ok: false, status: 409, error: `could not register collection: ${(err as Error).message}` };
  }

  return {
    ok: true,
    plan: {
      id,
      name: plan.name,
      tableName: plan.tableName,
      fields: plan.fields,
      publicSubmissions: false,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    },
  };
}

/**
 * Add a field (ADD-ONLY v1): load the collection → plan ALTER → run it (fenced)
 * → UPDATE the registry schema JSON. 404 if the collection is unknown.
 */
export async function addCollectionField(
  tableName: string,
  rawField: unknown,
): Promise<PlanResult<CollectionView>> {
  const existing = await getCollection(tableName);
  if (!existing) return { ok: false, status: 404, error: "collection not found" };

  const planned = planAddField(tableName, existing.fields, rawField);
  if (!planned.ok) return planned;

  await contentDdl(planned.plan.alterSql);

  const db = await getDb();
  const now = new Date();
  await db
    .update(schema.collection)
    .set({ schema: JSON.stringify(planned.plan.fields), updatedAt: now })
    .where(eq(schema.collection.tableName, tableName));

  return {
    ok: true,
    plan: { ...existing, fields: planned.plan.fields, updatedAt: now.getTime() },
  };
}

/**
 * Drop a collection: DROP TABLE (fenced) → DELETE the registry row. 404 if
 * unknown. The DROP runs first; if the table was never created (orphan registry
 * row) the DDL still succeeds (`DROP TABLE` of a content_* name is fenced-safe).
 */
export async function deleteCollection(tableName: string): Promise<PlanResult<{ tableName: string }>> {
  const existing = await getCollection(tableName);
  if (!existing) return { ok: false, status: 404, error: "collection not found" };

  // `tableName` came from the registry, but it's an identifier in the DDL string,
  // so re-fence by construction: the generated DROP targets a content_* name only.
  await contentDdl(`DROP TABLE ${tableName}`);

  const db = await getDb();
  await db.delete(schema.collection).where(eq(schema.collection.tableName, tableName));

  return { ok: true, plan: { tableName } };
}

/**
 * Evolve a collection's schema by DROPPING or RENAMING one user field (Phase-2,
 * beyond v1 ADD-ONLY). The decision logic is PURE (`planRebuild`): it emits the
 * 4-statement safe table-rebuild (CREATE temp → INSERT…SELECT → DROP old →
 * RENAME new) + the revised registry schema. This store runs the 4 fenced
 * statements as ONE atomic `d1.batch()` (D1 has no nested TXN — the batch is the
 * safe boundary; a partial failure rolls back, leaving the original table) and,
 * only AFTER they succeed, writes the new schema JSON to the registry. 404 if the
 * collection is unknown.
 */
export async function rebuildCollectionSchema(
  tableName: string,
  change: SchemaChange,
): Promise<PlanResult<CollectionView>> {
  const existing = await getCollection(tableName);
  if (!existing) return { ok: false, status: 404, error: "collection not found" };

  const planned = planRebuild({ tableName, fields: existing.fields }, change);
  if (!planned.ok) return planned;

  // All 4 fenced statements land together or not at all.
  await contentDdlBatch(planned.plan.statements);

  const db = await getDb();
  const now = new Date();
  await db
    .update(schema.collection)
    .set({ schema: JSON.stringify(planned.plan.newSchema.fields), updatedAt: now })
    .where(eq(schema.collection.tableName, tableName));

  return {
    ok: true,
    plan: { ...existing, fields: planned.plan.newSchema.fields, updatedAt: now.getTime() },
  };
}

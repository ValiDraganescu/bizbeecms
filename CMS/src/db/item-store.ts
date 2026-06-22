/**
 * content-collections — Slice 3: the collection-items store (live I/O).
 *
 * Thin layer over the PURE builders (`lib/content/item-write.ts`). It loads the
 * collection's registry schema (`getCollection`), runs the body through the
 * builders to get a PARAMETERIZED statement + bound params, and executes via
 * `contentSelect`/`contentWrite` (the Slice-0 fence). NO freeform SQL: the
 * builders only ever emit `?`-placeholdered statements over the collection's
 * `content_<slug>` table. Returns the same `PlanResult<T>` shape as Slice 2 so
 * the routes map `!ok` → HTTP status uniformly. Live D1 = HITL; the builders are
 * node-tested.
 */
import { contentSelect, contentWrite } from "../lib/content/content-db.ts";
import { getCollection } from "./collection-store.ts";
import type { PlanResult } from "../lib/content/collection-plan.ts";
import {
  buildInsert,
  buildUpdate,
  buildArchive,
  buildUnarchive,
  buildDelete,
  buildGet,
  buildList,
  type ListOptions,
} from "../lib/content/item-write.ts";

export type Item = Record<string, unknown>;

async function loadFields(tableName: string) {
  const view = await getCollection(tableName);
  if (!view) return null;
  return view;
}

/** List items (simple filter: status + live/archived/all). */
export async function listItems(
  tableName: string,
  opts: ListOptions = {},
): Promise<PlanResult<Item[]>> {
  const view = await loadFields(tableName);
  if (!view) return { ok: false, status: 404, error: "collection not found" };
  const { sql, params } = buildList(tableName, opts);
  const rows = await contentSelect<Item>(sql, params);
  return { ok: true, plan: rows };
}

/** Get one item by id, or 404. */
export async function getItem(tableName: string, id: string): Promise<PlanResult<Item>> {
  const view = await loadFields(tableName);
  if (!view) return { ok: false, status: 404, error: "collection not found" };
  const { sql, params } = buildGet(tableName, id);
  const rows = await contentSelect<Item>(sql, params);
  if (!rows[0]) return { ok: false, status: 404, error: "item not found" };
  return { ok: true, plan: rows[0] };
}

/** Create an item: validate+coerce body → parameterized INSERT (fenced). */
export async function createItem(
  tableName: string,
  body: Record<string, unknown>,
): Promise<PlanResult<Item>> {
  const view = await loadFields(tableName);
  if (!view) return { ok: false, status: 404, error: "collection not found" };

  const now = Date.now();
  const built = buildInsert(tableName, view.fields, body, now, () => crypto.randomUUID());
  if (!built.ok) return built;

  await contentWrite(built.value.sql, built.value.params);
  return getItem(tableName, built.value.id);
}

/** Update an item (PATCH): only supplied keys, validated → parameterized UPDATE. */
export async function updateItem(
  tableName: string,
  id: string,
  body: Record<string, unknown>,
): Promise<PlanResult<Item>> {
  const view = await loadFields(tableName);
  if (!view) return { ok: false, status: 404, error: "collection not found" };

  const built = buildUpdate(tableName, view.fields, id, body, Date.now());
  if (!built.ok) return built;

  const changes = await contentWrite(built.value.sql, built.value.params);
  if (changes === 0) return { ok: false, status: 404, error: "item not found" };
  return getItem(tableName, id);
}

/** Soft-archive an item (set archived_at). */
export async function archiveItem(tableName: string, id: string): Promise<PlanResult<Item>> {
  const view = await loadFields(tableName);
  if (!view) return { ok: false, status: 404, error: "collection not found" };

  const { sql, params } = buildArchive(tableName, id, Date.now());
  const changes = await contentWrite(sql, params);
  if (changes === 0) return { ok: false, status: 404, error: "item not found" };
  return getItem(tableName, id);
}

/** Un-archive an item (archived_at = NULL). */
export async function unarchiveItem(tableName: string, id: string): Promise<PlanResult<Item>> {
  const view = await loadFields(tableName);
  if (!view) return { ok: false, status: 404, error: "collection not found" };

  const { sql, params } = buildUnarchive(tableName, id, Date.now());
  const changes = await contentWrite(sql, params);
  if (changes === 0) return { ok: false, status: 404, error: "item not found" };
  return getItem(tableName, id);
}

/** Hard-delete an item by id. */
export async function deleteItem(tableName: string, id: string): Promise<PlanResult<{ id: string }>> {
  const view = await loadFields(tableName);
  if (!view) return { ok: false, status: 404, error: "collection not found" };

  const { sql, params } = buildDelete(tableName, id);
  const changes = await contentWrite(sql, params);
  if (changes === 0) return { ok: false, status: 404, error: "item not found" };
  return { ok: true, plan: { id } };
}

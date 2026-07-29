/**
 * Collection tool handlers (split from `tool-dispatch.ts`): create/query a
 * collection, item CRUD, and schema evolution (add/drop/rename field).
 * Registered in the shared HANDLERS map in `tool-dispatch.ts`.
 *
 * content-collections (Slice 6): each validates the model's args into the exact
 * shape a Slice 2-4 store expects, then calls that store (NO forked data path,
 * NO raw SQL to the model). The stores return PlanResult<T> ({ok,plan} |
 * {ok:false,status,error}); we map !ok → an error payload the model can recover
 * from.
 */
import {
  validateCreateCollection,
  validateAddItem,
  validateUpdateItem,
  validateArchiveItem,
  validateQuery,
  validateAddField,
  validateDropField,
  validateRenameField,
  validateUpdateCollection,
  validateUpdateCollectionField,
  validateDeleteCollection,
  validateItemRef,
  describeTypeCoercion,
} from "./collection-tools";
import {
  createCollection,
  addCollectionField,
  getCollection,
  rebuildCollectionSchema,
  updateCollectionMeta,
  deleteCollection,
} from "@/db/collection-store";
import {
  createItem,
  updateItem,
  archiveItem,
  unarchiveItem,
  deleteItem,
  getItem,
} from "@/db/item-store";
import { queryCollection } from "@/db/query-store";
import { findSiteReferences } from "@/lib/content/reference-scan-load";
import { describeReferences } from "@/lib/content/reference-scan";
import { unknownCollectionMessage } from "./tool-dispatch-shared";

export async function handleCreateCollection(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateCreateCollection(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await createCollection(valid.value.name, valid.value.fields);
    if (!res.ok) return { ok: false, errors: [res.error] };
    // `collectionName`, not `name` — top-level `name` is reserved for the tool name.
    return { ok: true, action: "created", collection: res.plan.tableName, collectionName: res.plan.name, fields: res.plan.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to create collection: ${(err as Error).message}`] };
  }
}

export async function handleAddCollectionItem(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateAddItem(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await createItem(valid.value.collection, valid.value.values);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "created", item: res.plan };
  } catch (err) {
    return { ok: false, errors: [`failed to add item: ${(err as Error).message}`] };
  }
}

export async function handleUpdateCollectionItem(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUpdateItem(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await updateItem(valid.value.collection, valid.value.id, valid.value.values);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "updated", item: res.plan };
  } catch (err) {
    return { ok: false, errors: [`failed to update item: ${(err as Error).message}`] };
  }
}

export async function handleArchiveCollectionItem(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateArchiveItem(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { collection, id, op } = valid.value;
  try {
    const res =
      op === "delete" ? await deleteItem(collection, id)
      : op === "unarchive" ? await unarchiveItem(collection, id)
      : await archiveItem(collection, id);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: op, item: res.plan };
  } catch (err) {
    return { ok: false, errors: [`failed to ${op} item: ${(err as Error).message}`] };
  }
}

export async function handleQueryCollection(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateQuery(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  // Be proactive: if the named collection doesn't exist, tell the model the
  // EXACT available table names (+ their fields) so it can retry without guessing
  // (the common failure: guessing `restaurants` for `content_restaurants`).
  const requested = valid.value.collection;
  if (!(await getCollection(requested))) {
    return { ok: false, errors: [await unknownCollectionMessage(requested)] };
  }
  try {
    const res = await queryCollection(requested, valid.value.spec);
    if (!res.ok) return { ok: false, errors: [res.error] };
    const { items, total, limit, offset } = res.plan;
    const out: Record<string, unknown> = { ok: true, items, total, limit, offset };
    if (offset + items.length < total) {
      out.hint = `showing ${items.length} of ${total} — more available; call again with offset=${offset + items.length} (or raise limit, max 1000)`;
    }
    return out;
  } catch (err) {
    return { ok: false, errors: [`failed to query collection: ${(err as Error).message}`] };
  }
}

// Schema evolution beyond ADD-field: drop/rename a user field via the system-
// generated table rebuild (rebuildCollectionSchema → contentDdlBatch). The planner
// rejects system columns / unknown fields / name collisions; we just shape args.

export async function handleAddCollectionField(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateAddField(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await addCollectionField(valid.value.collection, valid.value.field);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "added_field", collection: res.plan.tableName, field: valid.value.field.name, fields: res.plan.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to add field: ${(err as Error).message}`] };
  }
}

export async function handleDropCollectionField(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateDropField(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await rebuildCollectionSchema(valid.value.collection, { op: "drop", field: valid.value.field });
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "dropped_field", collection: res.plan.tableName, field: valid.value.field, fields: res.plan.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to drop field: ${(err as Error).message}`] };
  }
}

// mcp-full-crud-patch T5: registry-meta patch, field-attribute patch (type
// change via the SAME rebuild path — coercion is SQLite affinity, named in the
// result), guarded collection delete, and item restore / hard delete.

export async function handleUpdateCollection(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUpdateCollection(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { collection, patch } = valid.value;
  if (!(await getCollection(collection))) {
    return { ok: false, errors: [await unknownCollectionMessage(collection)] };
  }
  try {
    const res = await updateCollectionMeta(collection, patch);
    if (!res.ok) return { ok: false, errors: [res.error] };
    const { tableName, name, description, publicSubmissions } = res.plan;
    return { ok: true, action: "updated", collection: tableName, collectionName: name, description, publicSubmissions };
  } catch (err) {
    return { ok: false, errors: [`failed to update collection: ${(err as Error).message}`] };
  }
}

export async function handleUpdateCollectionField(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateUpdateCollectionField(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { collection, field, patch } = valid.value;
  const view = await getCollection(collection);
  if (!view) return { ok: false, errors: [await unknownCollectionMessage(collection)] };
  const existing = view.fields.find((f) => f.name === field);
  if (!existing) {
    const have = view.fields.map((f) => f.name).join(", ") || "none";
    return { ok: false, errors: [`field "${field}" does not exist on ${collection} — its user fields are: ${have}. Add one with add_collection_field.`] };
  }
  try {
    const res = await rebuildCollectionSchema(collection, { op: "update", field, patch });
    if (!res.ok) return { ok: false, errors: [res.error] };
    const out: Record<string, unknown> = { ok: true, action: "updated_field", collection: res.plan.tableName, field, fields: res.plan.fields };
    if (patch.type !== undefined && patch.type !== existing.type) {
      // Name the exact conversion the rebuild's INSERT…SELECT applied. The row
      // count is best-effort context (the coercion rule holds regardless).
      let rows: number | null = null;
      try {
        const counted = await queryCollection(collection, { archived: "all", limit: 1 });
        if (counted.ok) rows = counted.plan.total;
      } catch {
        /* count unavailable — describe the coercion without it */
      }
      out.coercion = describeTypeCoercion(existing.type, patch.type, rows);
    }
    return out;
  } catch (err) {
    return { ok: false, errors: [`failed to update field: ${(err as Error).message}`] };
  }
}

export async function handleDeleteCollection(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateDeleteCollection(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { collection } = valid.value;
  const view = await getCollection(collection);
  if (!view) return { ok: false, errors: [await unknownCollectionMessage(collection)] };
  try {
    const target = { kind: "collection", tableName: view.tableName } as const;
    const refs = await findSiteReferences(target);
    if (refs.length > 0) {
      return { ok: false, errors: [describeReferences(target, view.name, refs)] };
    }
    const res = await deleteCollection(collection);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "deleted", collection: view.tableName, collectionName: view.name };
  } catch (err) {
    return { ok: false, errors: [`failed to delete collection: ${(err as Error).message}`] };
  }
}

export async function handleRestoreCollectionItem(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateItemRef(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { collection, id } = valid.value;
  if (!(await getCollection(collection))) {
    return { ok: false, errors: [await unknownCollectionMessage(collection)] };
  }
  try {
    const current = await getItem(collection, id);
    if (!current.ok) {
      return { ok: false, errors: [`item "${id}" not found in ${collection} — query_collection with archived:"archived" lists the archived items and their ids`] };
    }
    if (current.plan.archived_at == null) {
      return { ok: false, errors: [`item "${id}" in ${collection} is not archived — nothing to restore. query_collection with archived:"archived" lists the items that can be restored.`] };
    }
    const res = await unarchiveItem(collection, id);
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "restored", item: res.plan };
  } catch (err) {
    return { ok: false, errors: [`failed to restore item: ${(err as Error).message}`] };
  }
}

export async function handleDeleteCollectionItem(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateItemRef(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  const { collection, id } = valid.value;
  if (!(await getCollection(collection))) {
    return { ok: false, errors: [await unknownCollectionMessage(collection)] };
  }
  try {
    const res = await deleteItem(collection, id);
    if (!res.ok) {
      const msg = res.status === 404
        ? `item "${id}" not found in ${collection} — find item ids with query_collection (it may already be deleted)`
        : res.error;
      return { ok: false, errors: [msg] };
    }
    return { ok: true, action: "deleted", collection, id };
  } catch (err) {
    return { ok: false, errors: [`failed to delete item: ${(err as Error).message}`] };
  }
}

export async function handleRenameCollectionField(args: unknown): Promise<Record<string, unknown>> {
  const valid = validateRenameField(args);
  if (!valid.ok) return { ok: false, errors: [valid.error] };
  try {
    const res = await rebuildCollectionSchema(valid.value.collection, { op: "rename", field: valid.value.field, to: valid.value.to });
    if (!res.ok) return { ok: false, errors: [res.error] };
    return { ok: true, action: "renamed_field", collection: res.plan.tableName, field: valid.value.field, to: valid.value.to, fields: res.plan.fields };
  } catch (err) {
    return { ok: false, errors: [`failed to rename field: ${(err as Error).message}`] };
  }
}

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
} from "./collection-tools";
import {
  createCollection,
  addCollectionField,
  getCollection,
  rebuildCollectionSchema,
} from "@/db/collection-store";
import {
  createItem,
  updateItem,
  archiveItem,
  unarchiveItem,
  deleteItem,
} from "@/db/item-store";
import { queryCollection } from "@/db/query-store";
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

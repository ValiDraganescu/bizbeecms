/**
 * content-collections — Slice 2: PURE planners for create / add-field.
 *
 * The runtime-DDL routes (`/api/collections`) need to: enforce the 100-collection
 * cap, derive `content_<slug>`, reject name collisions, and generate the DDL —
 * all BEFORE touching D1. That decision logic is pure (no I/O), so it lives here
 * and is exhaustively node-tested; the store (`collection-store.ts`) only does the
 * live Drizzle reads/writes + `contentDdl` exec around these plans.
 *
 * Every generated DDL string is produced by the Slice-1 generator
 * (`collection-schema.ts`), so it's fence-safe by construction; the store STILL
 * runs each through `contentDdl` (the fence) before exec (CAVEAT: don't trust,
 * verify).
 */
import {
  buildCreateTableSql,
  buildAddColumnSql,
  tableNameForSlug,
  MAX_COLUMNS,
  type CollectionField,
} from "./collection-schema.ts";

/** Hard cap on collections per Site (USER number; enforced against the registry). */
export const MAX_COLLECTIONS = 100;

export interface CreatePlan {
  /** Operator-facing display name. */
  name: string;
  /** The real D1 table name: `content_<slug>`. */
  tableName: string;
  /** The normalized field list (what gets stored as the registry `schema` JSON). */
  fields: CollectionField[];
  /** The CREATE TABLE DDL to run through `contentDdl`. */
  createSql: string;
}

export type PlanResult<T> =
  | { ok: true; plan: T }
  | { ok: false; status: number; error: string };

/**
 * Plan a collection create. PURE. Validates against the CURRENT registry state
 * passed in (`existingCount`, `existingTableNames`) so the store can read those
 * once and hand them here. Returns a 4xx-coded rejection or the executable plan.
 *
 *  - 400 if name/fields are malformed (empty name, slug → empty table name,
 *    bad field name/type, dup field, >100 columns — surfaced from the generator);
 *  - 409 if the derived `content_<slug>` already exists in the registry;
 *  - 429-ish (we use 409 with a cap message — keep it 4xx) if the cap is hit.
 */
export function planCreate(
  rawName: unknown,
  rawFields: unknown,
  existingCount: number,
  existingTableNames: Iterable<string>,
): PlanResult<CreatePlan> {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { ok: false, status: 400, error: "collection name is required" };

  if (existingCount >= MAX_COLLECTIONS) {
    return {
      ok: false,
      status: 409,
      error: `collection cap reached (${MAX_COLLECTIONS} per Site)`,
    };
  }

  const tableName = tableNameForSlug(name);
  if (tableName === "content_") {
    // slug normalized to empty (e.g. name was only punctuation)
    return { ok: false, status: 400, error: "collection name has no usable slug" };
  }

  const existing = new Set<string>();
  for (const t of existingTableNames) existing.add(t);
  if (existing.has(tableName)) {
    return { ok: false, status: 409, error: `collection "${tableName}" already exists` };
  }

  const fields = normalizeFields(rawFields);
  let createSql: string;
  try {
    // The generator validates names/types/dups/cap and throws a precise message.
    createSql = buildCreateTableSql(tableName, fields);
  } catch (err) {
    return { ok: false, status: 400, error: (err as Error).message };
  }

  return { ok: true, plan: { name, tableName, fields, createSql } };
}

export interface AddFieldPlan {
  tableName: string;
  /** The field appended (post-validation). */
  field: CollectionField;
  /** The full new field list to persist back to the registry schema. */
  fields: CollectionField[];
  /** The ALTER TABLE ADD COLUMN DDL to run through `contentDdl`. */
  alterSql: string;
}

/**
 * Plan an ADD-ONLY field addition (v1). PURE. Given the collection's current
 * field list (from the registry) + the requested new field, returns the ALTER
 * DDL and the merged field list. Rejects a name colliding with an existing field
 * or system column, a bad type, or a column-cap overflow.
 */
export function planAddField(
  tableName: string,
  currentFields: CollectionField[],
  rawField: unknown,
): PlanResult<AddFieldPlan> {
  const field = normalizeField(rawField);
  if (!field) return { ok: false, status: 400, error: "field { name, type } is required" };

  if (currentFields.some((f) => f.name === field.name)) {
    return { ok: false, status: 409, error: `field "${field.name}" already exists` };
  }

  // +6 system columns + existing + the new one must stay within the column cap.
  if (currentFields.length + 1 + 6 > MAX_COLUMNS) {
    return { ok: false, status: 409, error: `column cap reached (${MAX_COLUMNS})` };
  }

  let alterSql: string;
  try {
    alterSql = buildAddColumnSql(tableName, field);
  } catch (err) {
    return { ok: false, status: 400, error: (err as Error).message };
  }

  return { ok: true, plan: { tableName, field, fields: [...currentFields, field], alterSql } };
}

/** Coerce an unknown JSON value into a clean CollectionField[] (drops junk). */
export function normalizeFields(raw: unknown): CollectionField[] {
  if (!Array.isArray(raw)) return [];
  const out: CollectionField[] = [];
  for (const f of raw) {
    const nf = normalizeField(f);
    if (nf) out.push(nf);
  }
  return out;
}

/** Coerce ONE unknown value into a CollectionField, or null if it lacks name/type. */
export function normalizeField(raw: unknown): CollectionField | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.type !== "string") return null;
  const field: CollectionField = {
    name: o.name.trim(),
    type: o.type as CollectionField["type"],
  };
  if (o.required === true) field.required = true;
  if (typeof o.label === "string") field.label = o.label;
  if (o.default !== undefined && (typeof o.default === "string" || typeof o.default === "number" || typeof o.default === "boolean")) {
    field.default = o.default;
  }
  if (Array.isArray(o.options)) {
    field.options = o.options
      .filter((x): x is { value: string; label: string } =>
        !!x && typeof x === "object" &&
        typeof (x as Record<string, unknown>).value === "string" &&
        typeof (x as Record<string, unknown>).label === "string")
      .map((x) => ({ value: x.value, label: x.label }));
  }
  return field;
}

/**
 * content-collections — Slice 3: item value validation/coercion + parameterized
 * SQL builders (PURE, no I/O).
 *
 * This is the WRITE trust boundary for collection items. The registry's field
 * schema (from `getCollection`) is the source of truth: every incoming value is
 * validated + COERCED to the field's SQLite affinity here, then the INSERT/UPDATE
 * SQL is built with `?` placeholders and a parallel bound-params array. The SQL
 * targets the system columns (id/slug/status/archived_at/created_at/updated_at,
 * CAVEAT: use EXACTLY these names) + the user columns; it goes to `contentWrite`,
 * which fences it and binds the params — NO freeform/interpolated SQL ever.
 *
 * Coercion rules (documented — Slice 5 UI + Slice 6 AI tools rely on these):
 *   bool/boolean → 0|1            (truthy/"true"/"1"/1 → 1, else 0)
 *   int          → trunc integer  (reject non-finite)
 *   number       → REAL           (reject non-finite)
 *   date/datetime/time → stored as ISO string (TEXT). Accepts an ISO string or an
 *                        epoch-ms number (converted to ISO). Invalid → reject.
 *   select       → must be one of the field's options (if options declared)
 *   multiselect  → array of allowed option values, JSON-stringified to TEXT
 *   string/text/richtext/ref/asset → String(value)
 * `required` fields reject null/undefined/empty-string.
 */
import { SYSTEM_COLUMNS, type CollectionField } from "./collection-schema.ts";

/** Per-item status. */
export const ITEM_STATUSES = ["draft", "published"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

/** Coerce+validate ONE value against its field type. PURE. */
export function coerceFieldValue(
  field: CollectionField,
  raw: unknown,
): ValidateResult<string | number | null> {
  const missing = raw === undefined || raw === null || raw === "";
  if (missing) {
    if (field.required) {
      return { ok: false, status: 400, error: `field "${field.name}" is required` };
    }
    return { ok: true, value: null };
  }

  switch (field.type) {
    case "bool":
    case "boolean": {
      const truthy = raw === true || raw === 1 || raw === "1" || raw === "true";
      const falsy = raw === false || raw === 0 || raw === "0" || raw === "false";
      if (!truthy && !falsy) {
        return { ok: false, status: 400, error: `field "${field.name}" must be a boolean` };
      }
      return { ok: true, value: truthy ? 1 : 0 };
    }
    case "int": {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return { ok: false, status: 400, error: `field "${field.name}" must be an integer` };
      }
      return { ok: true, value: Math.trunc(n) };
    }
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return { ok: false, status: 400, error: `field "${field.name}" must be a number` };
      }
      return { ok: true, value: n };
    }
    case "date":
    case "datetime":
    case "time": {
      // Accept ISO string or epoch-ms number → store as ISO TEXT.
      const d = typeof raw === "number" ? new Date(raw) : new Date(String(raw));
      if (Number.isNaN(d.getTime())) {
        return { ok: false, status: 400, error: `field "${field.name}" is not a valid date/time` };
      }
      return { ok: true, value: d.toISOString() };
    }
    case "select": {
      const v = String(raw);
      if (field.options && field.options.length > 0 && !field.options.some((o) => o.value === v)) {
        return { ok: false, status: 400, error: `field "${field.name}" must be one of its options` };
      }
      return { ok: true, value: v };
    }
    case "multiselect": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      if (field.options && field.options.length > 0) {
        const allowed = new Set(field.options.map((o) => o.value));
        const bad = arr.find((v) => !allowed.has(v));
        if (bad !== undefined) {
          return { ok: false, status: 400, error: `field "${field.name}" has an invalid option: ${bad}` };
        }
      }
      return { ok: true, value: JSON.stringify(arr) };
    }
    default:
      // string/text/richtext/ref/asset
      return { ok: true, value: String(raw) };
  }
}

/** Validate the `status` value (defaults to "draft" when absent). PURE. */
export function coerceStatus(raw: unknown): ValidateResult<ItemStatus> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: "draft" };
  const v = String(raw);
  if (!(ITEM_STATUSES as readonly string[]).includes(v)) {
    return { ok: false, status: 400, error: `status must be one of: ${ITEM_STATUSES.join(", ")}` };
  }
  return { ok: true, value: v as ItemStatus };
}

export interface BuiltSql {
  sql: string;
  params: unknown[];
}

export interface InsertPlan extends BuiltSql {
  id: string;
}

/**
 * Build the parameterized INSERT for a new item. PURE. `body` is the untrusted
 * JSON object; `fields` is the registry schema. `now` (ms) is injected so it's
 * testable. Generates the id (caller may override via `idFactory` for tests).
 *
 * System columns: id (generated), slug (from body, optional TEXT), status
 * (validated, default draft), created_at/updated_at (now ms), archived_at (NULL).
 */
export function buildInsert(
  tableName: string,
  fields: CollectionField[],
  body: Record<string, unknown>,
  now: number,
  idFactory: () => string,
): ValidateResult<InsertPlan> {
  const status = coerceStatus(body.status);
  if (!status.ok) return status;

  const cols: string[] = ["id", "slug", "status", "archived_at", "created_at", "updated_at"];
  const id = idFactory();
  const slug = body.slug === undefined || body.slug === null ? null : String(body.slug);
  const params: unknown[] = [id, slug, status.value, null, now, now];

  for (const f of fields) {
    const res = coerceFieldValue(f, body[f.name]);
    if (!res.ok) return res;
    cols.push(f.name);
    params.push(res.value);
  }

  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders})`;
  return { ok: true, value: { sql, params, id } };
}

/**
 * Build the parameterized UPDATE for an item by id. PURE. Only keys PRESENT in
 * `body` are updated (PATCH semantics). `status`/`slug` are updatable system
 * columns; user fields are validated+coerced. `updated_at` is always set. Returns
 * a 400 if nothing updatable was supplied.
 */
export function buildUpdate(
  tableName: string,
  fields: CollectionField[],
  id: string,
  body: Record<string, unknown>,
  now: number,
): ValidateResult<BuiltSql> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if ("status" in body) {
    const status = coerceStatus(body.status);
    if (!status.ok) return status;
    sets.push("status = ?");
    params.push(status.value);
  }
  if ("slug" in body) {
    sets.push("slug = ?");
    params.push(body.slug === undefined || body.slug === null ? null : String(body.slug));
  }
  for (const f of fields) {
    if (!(f.name in body)) continue;
    const res = coerceFieldValue(f, body[f.name]);
    if (!res.ok) return res;
    sets.push(`${f.name} = ?`);
    params.push(res.value);
  }

  if (sets.length === 0) {
    return { ok: false, status: 400, error: "no updatable fields supplied" };
  }
  sets.push("updated_at = ?");
  params.push(now);

  params.push(id);
  const sql = `UPDATE ${tableName} SET ${sets.join(", ")} WHERE id = ?`;
  return { ok: true, value: { sql, params } };
}

/** Build the soft-archive UPDATE (set archived_at = now) for an item. PURE. */
export function buildArchive(tableName: string, id: string, now: number): BuiltSql {
  return {
    sql: `UPDATE ${tableName} SET archived_at = ?, updated_at = ? WHERE id = ?`,
    params: [now, now, id],
  };
}

/** Build the un-archive UPDATE (archived_at = NULL). PURE. */
export function buildUnarchive(tableName: string, id: string, now: number): BuiltSql {
  return {
    sql: `UPDATE ${tableName} SET archived_at = NULL, updated_at = ? WHERE id = ?`,
    params: [now, id],
  };
}

/** Build the hard-delete DELETE for an item by id. PURE. */
export function buildDelete(tableName: string, id: string): BuiltSql {
  return { sql: `DELETE FROM ${tableName} WHERE id = ?`, params: [id] };
}

/** Build the single-item SELECT by id. PURE. */
export function buildGet(tableName: string, id: string): BuiltSql {
  return { sql: `SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`, params: [id] };
}

export interface ListOptions {
  /** Only items with this status (draft|published). Omit = any. */
  status?: string;
  /** "live" (default, archived_at IS NULL), "archived", or "all". */
  archived?: "live" | "archived" | "all";
  /** Max rows (clamped to [1, limitMax]). */
  limit?: number;
}

/**
 * Build the list SELECT (simple — full structured query is Slice 4). PURE.
 * Defaults to live (non-archived) rows, newest first, capped at `limitMax`.
 * Status / archived filters are fixed enum-derived clauses (never raw input in
 * the SQL); any user value is bound or validated to the enum first.
 */
export function buildList(
  tableName: string,
  opts: ListOptions = {},
  limitMax = 1000,
): BuiltSql {
  const where: string[] = [];
  const params: unknown[] = [];

  const archived = opts.archived ?? "live";
  if (archived === "live") where.push("archived_at IS NULL");
  else if (archived === "archived") where.push("archived_at IS NOT NULL");
  // "all" → no archived clause

  if (opts.status && (ITEM_STATUSES as readonly string[]).includes(opts.status)) {
    where.push("status = ?");
    params.push(opts.status);
  }

  const limit = Math.max(1, Math.min(limitMax, Math.trunc(Number(opts.limit) || limitMax)));
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  return {
    sql: `SELECT * FROM ${tableName}${whereSql} ORDER BY created_at DESC LIMIT ${limit}`,
    params,
  };
}

// ponytail: kept SYSTEM_COLUMNS import to assert at module load the system names
// the builders hard-code still match Slice 1's source of truth.
if (
  SYSTEM_COLUMNS.join(",") !== "id,slug,status,archived_at,created_at,updated_at"
) {
  throw new Error("item-write: SYSTEM_COLUMNS drifted from the builders");
}

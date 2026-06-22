/**
 * content-collections — Slice 4: the structured-query SQL compiler (PURE, no I/O).
 *
 * The READ trust boundary. A structured query (filter[] + sort[] + paginate +
 * optional text search) is compiled here to a SAFE, PARAMETERIZED SELECT over the
 * collection's typed columns. The invariants (mirrored from Slice 3's write
 * builders, asserted by the tests):
 *   - Column NAMES that go into the SQL are VALIDATED against the registry fields
 *     + SYSTEM_COLUMNS (a whitelist) — an unknown column is a 400, never inlined
 *     or bound. Column names are identifiers, not values; they can't be `?`-bound.
 *   - Operators are whitelisted (eq/ne/lt/lte/gt/gte/like/in/is_null/not_null).
 *   - EVERY user VALUE is coerced via `coerceFieldValue` (same source as writes)
 *     and bound with `?` — no value is ever string-concatenated into the SQL.
 *   - Text search = a simple `LIKE` over the collection's text fields (NO FTS5 in
 *     v1, USER DECISION). The needle is bound; the `%`-wrapping happens on the
 *     bound param, not in the SQL.
 *   - Sort directions are a fixed ASC|DESC enum; limit/offset are clamped integers
 *     inlined as plain numbers (validated to be finite non-negative ints).
 *
 * Same split as Slices 2/3: this PURE module is node-tested with fakes; the thin
 * live store (`db/query-store.ts`) runs the compiled SQL through `contentSelect`.
 */
import { SYSTEM_COLUMNS, type CollectionField } from "./collection-schema.ts";
import { coerceFieldValue } from "./item-write.ts";

export type PlanResult<T> =
  | { ok: true; plan: T }
  | { ok: false; status: number; error: string };

/** Comparison operators a filter clause may use. */
export const FILTER_OPS = [
  "eq", "ne", "lt", "lte", "gt", "gte", "like", "in", "is_null", "not_null",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

const OP_SQL: Record<Exclude<FilterOp, "in" | "is_null" | "not_null">, string> = {
  eq: "=", ne: "!=", lt: "<", lte: "<=", gt: ">", gte: ">=", like: "LIKE",
};

export interface FilterClause {
  field: string;
  op: FilterOp;
  /** Required for all ops except is_null/not_null. `in` takes an array. */
  value?: unknown;
}

export interface SortClause {
  field: string;
  dir?: "asc" | "desc";
}

export interface QuerySpec {
  filters?: FilterClause[];
  sort?: SortClause[];
  /** Free-text search over text fields (simple LIKE — NO FTS5 in v1). */
  search?: string;
  /** Page size. Clamped to [1, limitMax]. Default limitMax. */
  limit?: number;
  /** Row offset. Clamped to [0, ∞). Default 0. */
  offset?: number;
  /** "live" (default), "archived", or "all". */
  archived?: "live" | "archived" | "all";
  /** Optional status filter (draft|published). */
  status?: string;
}

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

/** The text-affinity field types a `search` LIKE can scan. */
const TEXT_TYPES = new Set(["string", "text", "richtext", "select", "multiselect", "ref", "asset"]);

const STATUS_VALUES = new Set(["draft", "published"]);

/**
 * Build a `column → CollectionField` lookup for the queryable columns: the user
 * fields PLUS the system columns (id/slug/status/archived_at/created_at/updated_at)
 * which are always sortable/filterable. System columns map to a synthetic field
 * descriptor so `coerceFieldValue` knows their affinity.
 */
function queryableColumns(fields: CollectionField[]): Map<string, CollectionField> {
  const map = new Map<string, CollectionField>();
  // System columns — affinity-appropriate synthetic descriptors.
  map.set("id", { name: "id", type: "string" });
  map.set("slug", { name: "slug", type: "string" });
  map.set("status", { name: "status", type: "string" });
  map.set("archived_at", { name: "archived_at", type: "int" });
  map.set("created_at", { name: "created_at", type: "int" });
  map.set("updated_at", { name: "updated_at", type: "int" });
  for (const f of fields) map.set(f.name, f);
  // ponytail: user field names can't collide with system cols (Slice-1 guard), so
  // this map never silently shadows a system column.
  return map;
}

/** Build the WHERE clause + params from filters/search/status/archived. PURE. */
function buildWhere(
  spec: QuerySpec,
  cols: Map<string, CollectionField>,
  fields: CollectionField[],
): PlanResult<{ where: string[]; params: unknown[] }> {
  const where: string[] = [];
  const params: unknown[] = [];

  // archived scope (fixed clause, never user-inlined)
  const archived = spec.archived ?? "live";
  if (archived === "live") where.push("archived_at IS NULL");
  else if (archived === "archived") where.push("archived_at IS NOT NULL");

  // status (enum-validated, bound)
  if (spec.status) {
    if (!STATUS_VALUES.has(spec.status)) {
      return { ok: false, status: 400, error: `invalid status: ${spec.status}` };
    }
    where.push("status = ?");
    params.push(spec.status);
  }

  // filters
  for (const f of spec.filters ?? []) {
    const col = cols.get(f.field);
    if (!col) return { ok: false, status: 400, error: `unknown filter field: ${f.field}` };
    if (!(FILTER_OPS as readonly string[]).includes(f.op)) {
      return { ok: false, status: 400, error: `unknown filter op: ${f.op}` };
    }

    if (f.op === "is_null") { where.push(`${col.name} IS NULL`); continue; }
    if (f.op === "not_null") { where.push(`${col.name} IS NOT NULL`); continue; }

    if (f.op === "in") {
      const arr = Array.isArray(f.value) ? f.value : [f.value];
      if (arr.length === 0) {
        return { ok: false, status: 400, error: `filter "in" on ${f.field} needs a non-empty array` };
      }
      const bound: unknown[] = [];
      for (const raw of arr) {
        const c = coerceFieldValue(col, raw);
        if (!c.ok) return c;
        bound.push(c.value);
      }
      where.push(`${col.name} IN (${bound.map(() => "?").join(", ")})`);
      params.push(...bound);
      continue;
    }

    // like → coerce to a string and %-wrap the BOUND param (not the SQL)
    if (f.op === "like") {
      const needle = f.value === undefined || f.value === null ? "" : String(f.value);
      where.push(`${col.name} LIKE ?`);
      params.push(`%${needle}%`);
      continue;
    }

    // comparison ops — coerce the value to the field affinity, then bind
    const c = coerceFieldValue(col, f.value);
    if (!c.ok) return c;
    where.push(`${col.name} ${OP_SQL[f.op as keyof typeof OP_SQL]} ?`);
    params.push(c.value);
  }

  // free-text search across text fields (simple LIKE, NO FTS5)
  if (spec.search && spec.search.trim() !== "") {
    const textCols = fields.filter((fl) => TEXT_TYPES.has(fl.type)).map((fl) => fl.name);
    if (textCols.length > 0) {
      const ors = textCols.map((c) => `${c} LIKE ?`);
      where.push(`(${ors.join(" OR ")})`);
      for (let i = 0; i < textCols.length; i++) params.push(`%${spec.search}%`);
    } else {
      // no searchable columns → match nothing (don't silently ignore the intent)
      where.push("0 = 1");
    }
  }

  return { ok: true, plan: { where, params } };
}

/** Build the ORDER BY clause from sort[]. Validates columns + dir. PURE. */
function buildOrderBy(
  sort: SortClause[] | undefined,
  cols: Map<string, CollectionField>,
): PlanResult<string> {
  if (!sort || sort.length === 0) return { ok: true, plan: "ORDER BY created_at DESC" };
  const parts: string[] = [];
  for (const s of sort) {
    const col = cols.get(s.field);
    if (!col) return { ok: false, status: 400, error: `unknown sort field: ${s.field}` };
    const dir = s.dir === "asc" ? "ASC" : s.dir === "desc" || s.dir === undefined ? "DESC" : null;
    if (dir === null) return { ok: false, status: 400, error: `invalid sort dir: ${s.dir}` };
    parts.push(`${col.name} ${dir}`);
  }
  return { ok: true, plan: `ORDER BY ${parts.join(", ")}` };
}

/** Clamp a limit to [1, limitMax]; default limitMax. PURE. */
function clampLimit(limit: number | undefined, limitMax: number): number {
  if (limit === undefined) return limitMax;
  const n = Math.trunc(Number(limit));
  if (!Number.isFinite(n)) return limitMax;
  return Math.max(1, Math.min(limitMax, n));
}

/** Clamp an offset to [0, ∞). PURE. */
function clampOffset(offset: number | undefined): number {
  if (offset === undefined) return 0;
  const n = Math.trunc(Number(offset));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Compile a structured query into a parameterized SELECT over `tableName`. PURE.
 * Returns a 400 PlanResult for any unknown column/op/dir/value. limit/offset are
 * validated integers inlined as plain numbers; every user VALUE is `?`-bound.
 */
export function compileQuery(
  tableName: string,
  fields: CollectionField[],
  spec: QuerySpec,
  limitMax = 1000,
): PlanResult<BuiltQuery> {
  const cols = queryableColumns(fields);

  const w = buildWhere(spec, cols, fields);
  if (!w.ok) return w;
  const ob = buildOrderBy(spec.sort, cols);
  if (!ob.ok) return ob;

  const limit = clampLimit(spec.limit, limitMax);
  const offset = clampOffset(spec.offset);

  const whereSql = w.plan.where.length ? ` WHERE ${w.plan.where.join(" AND ")}` : "";
  const offsetSql = offset > 0 ? ` OFFSET ${offset}` : "";
  const sql = `SELECT * FROM ${tableName}${whereSql} ${ob.plan} LIMIT ${limit}${offsetSql}`;
  return { ok: true, plan: { sql, params: w.plan.params } };
}

/**
 * Compile the matching COUNT(*) for the same filters (no sort/limit/offset). PURE.
 * Used to return a total alongside the page. Reuses the same WHERE builder so the
 * count matches the query's filter set exactly.
 */
export function compileCount(
  tableName: string,
  fields: CollectionField[],
  spec: QuerySpec,
): PlanResult<BuiltQuery> {
  const cols = queryableColumns(fields);
  const w = buildWhere(spec, cols, fields);
  if (!w.ok) return w;
  const whereSql = w.plan.where.length ? ` WHERE ${w.plan.where.join(" AND ")}` : "";
  // ponytail: alias `n` so the row reads `{ n: <count> }` regardless of D1's
  // default column naming for `COUNT(*)`.
  return { ok: true, plan: { sql: `SELECT COUNT(*) AS n FROM ${tableName}${whereSql}`, params: w.plan.params } };
}

// ponytail: SYSTEM_COLUMNS pinned at load — the synthetic descriptors above must
// stay in lockstep with Slice-1's source of truth.
if (SYSTEM_COLUMNS.join(",") !== "id,slug,status,archived_at,created_at,updated_at") {
  throw new Error("query-compiler: SYSTEM_COLUMNS drifted from the compiler");
}

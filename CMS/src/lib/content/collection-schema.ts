/**
 * content-collections — Slice 1: the field-schema → DDL generator (PURE).
 *
 * A collection's logical schema lives as JSON in the built-in `collection`
 * registry (see db/schema.ts). This module is the SYSTEM that turns that typed
 * field schema into the real `CREATE TABLE content_<slug>(...)` DDL — nobody
 * authors raw DDL (USER DECISION / CAVEAT). Everything here is PURE (no I/O,
 * no D1); Slice 2 wires the generated string through the Slice-0 fence
 * (`contentDdl`) to actually run it.
 *
 * Field-type vocabulary: reuses + extends the page-builder `propsSchema` types
 * (`lib/pages/page-blocks.ts` PropFieldType) so the rich UI is shared. The
 * page-builder knows string/richtext/number/boolean/select/date/time; this adds
 * the data-collection types `text` (long text), `int` (whole number), `bool`
 * (alias), `datetime`, `multiselect`. `ref`/`asset` are RESERVED for the binding
 * phase (Phase 2) — accepted in the vocab but stored as plain TEXT for now.
 *
 * SQLite affinity mapping (the only three D1/SQLite cares about):
 *   TEXT    — string, text, richtext, select, multiselect, date, datetime, time,
 *             ref, asset
 *   INTEGER — int, bool/boolean   (bool stored as 0/1)
 *   REAL    — number
 *
 * EVERY generated statement MUST pass the Slice-0 fence
 * (`validateStatement(sql, "write")`) and target a `content_*` table — the tests
 * assert this. Keep statements SINGLE (the fence rejects multi-statement) and
 * never interpolate user data as a literal (column NAMES are validated to a
 * strict identifier charset; DEFAULT literals are typed/escaped).
 */

import { isContentName } from "./fence.ts";

/** A collection field type — the propsSchema vocab + data-collection extensions. */
export type CollectionFieldType =
  | "string"
  | "text"
  | "richtext"
  | "number"
  | "int"
  | "bool"
  | "boolean"
  | "select"
  | "multiselect"
  | "date"
  | "datetime"
  | "time"
  | "ref"
  | "asset";

export const COLLECTION_FIELD_TYPES: ReadonlySet<CollectionFieldType> = new Set<CollectionFieldType>([
  "string", "text", "richtext", "number", "int", "bool", "boolean",
  "select", "multiselect", "date", "datetime", "time", "ref", "asset",
]);

/** One field in a collection's logical schema (the JSON stored in the registry). */
export interface CollectionField {
  /** Column name. Must be a valid identifier and not collide with a system column. */
  name: string;
  type: CollectionFieldType;
  required?: boolean;
  /** Default value (typed); used as the column DEFAULT. Omit for no default. */
  default?: string | number | boolean;
  label?: string;
  /** select/multiselect only: the allowed options (for the UI; not enforced in DDL v1). */
  options?: { value: string; label: string }[];
}

/**
 * The SYSTEM columns every content table carries, reserved NOW so the binding
 * phase (Phase 2) and items CRUD (Slice 3) have stable names. User field names
 * may NOT collide with these.
 *  - id           TEXT PRIMARY KEY     — stable item id
 *  - slug         TEXT                 — per-item slug (binding/detail pages)
 *  - status       TEXT default 'draft' — draft|published
 *  - archived_at  INTEGER (nullable)   — soft archive timestamp (ms); NULL = live
 *  - created_at / updated_at INTEGER   — ms epoch, default now
 */
export const SYSTEM_COLUMNS = [
  "id", "slug", "status", "archived_at", "created_at", "updated_at",
] as const;

const SYSTEM_COLUMN_SET: ReadonlySet<string> = new Set(SYSTEM_COLUMNS);

/** Column/identifier charset — strict, so a name can never inject SQL. */
const COLUMN_NAME_RE = /^[a-z][a-z0-9_]*$/;

/** D1 / SQLite hard limit: 100 columns per table. We include the 6 system columns. */
export const MAX_COLUMNS = 100;

/** Map a field type to its SQLite column affinity. PURE. */
export function affinityFor(type: CollectionFieldType): "TEXT" | "INTEGER" | "REAL" {
  switch (type) {
    case "number":
      return "REAL";
    case "int":
    case "bool":
    case "boolean":
      return "INTEGER";
    default:
      // string/text/richtext/select/multiselect/date/datetime/time/ref/asset
      return "TEXT";
  }
}

/** Escape a value into a SQL literal for a DEFAULT clause. PURE, type-aware. */
function defaultLiteral(field: CollectionField): string {
  const v = field.default;
  if (v === undefined || v === null) return "";
  const aff = affinityFor(field.type);
  if (aff === "INTEGER") {
    // bool → 0/1; int → the integer.
    if (field.type === "bool" || field.type === "boolean") {
      return ` DEFAULT ${v ? 1 : 0}`;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return ` DEFAULT ${Math.trunc(n)}`;
  }
  if (aff === "REAL") {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return ` DEFAULT ${n}`;
  }
  // TEXT — single-quote, escape embedded quotes.
  return ` DEFAULT '${String(v).replace(/'/g, "''")}'`;
}

/** Validate a field name. Throws on a bad/colliding name. */
function assertFieldName(name: string): void {
  if (!COLUMN_NAME_RE.test(name)) {
    throw new Error(`invalid field name: ${JSON.stringify(name)} (must match ${COLUMN_NAME_RE})`);
  }
  if (SYSTEM_COLUMN_SET.has(name)) {
    throw new Error(`field name "${name}" collides with a reserved system column`);
  }
}

/**
 * The full ordered column list for a collection: the 6 system columns first,
 * then one column per user field. Each entry is `{ name, sql }` where `sql` is
 * the column definition (`name AFFINITY [NOT NULL] [DEFAULT ...]`). PURE.
 *
 * Throws on duplicate names, bad names, unknown types, or a system-column clash.
 */
export function buildItemColumns(fields: CollectionField[]): { name: string; sql: string }[] {
  const cols: { name: string; sql: string }[] = [
    { name: "id", sql: "id TEXT PRIMARY KEY NOT NULL" },
    { name: "slug", sql: "slug TEXT" },
    { name: "status", sql: "status TEXT NOT NULL DEFAULT 'draft'" },
    { name: "archived_at", sql: "archived_at INTEGER" },
    { name: "created_at", sql: "created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)" },
    { name: "updated_at", sql: "updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)" },
  ];

  const seen = new Set<string>(SYSTEM_COLUMN_SET);
  for (const f of fields) {
    if (!f || typeof f.name !== "string") {
      throw new Error("field missing a name");
    }
    assertFieldName(f.name);
    if (seen.has(f.name)) {
      throw new Error(`duplicate field name: ${f.name}`);
    }
    if (!COLLECTION_FIELD_TYPES.has(f.type)) {
      throw new Error(`unknown field type: ${JSON.stringify(f.type)} for field ${f.name}`);
    }
    seen.add(f.name);

    const aff = affinityFor(f.type);
    const notNull = f.required ? " NOT NULL" : "";
    const def = defaultLiteral(f);
    cols.push({ name: f.name, sql: `${f.name} ${aff}${notNull}${def}` });
  }

  if (cols.length > MAX_COLUMNS) {
    throw new Error(`too many columns: ${cols.length} > D1 limit ${MAX_COLUMNS}`);
  }
  return cols;
}

/**
 * Generate the `CREATE TABLE content_<slug>(...)` DDL for a collection. PURE,
 * single statement (no trailing `;`), fence-safe. `tableName` MUST already be a
 * valid `content_*` name (throws otherwise). The returned string is guaranteed
 * to pass `validateStatement(sql, "write")` — Slice 2 runs it via the fence.
 */
export function buildCreateTableSql(tableName: string, fields: CollectionField[]): string {
  if (!isContentName(tableName)) {
    throw new Error(`table name must match content_* : ${JSON.stringify(tableName)}`);
  }
  const cols = buildItemColumns(fields);
  const body = cols.map((c) => `  ${c.sql}`).join(",\n");
  return `CREATE TABLE ${tableName} (\n${body}\n)`;
}

/**
 * Generate the `ALTER TABLE content_<slug> ADD COLUMN ...` DDL for ADD-ONLY
 * schema evolution (v1, USER DECISION). One statement per added field; the
 * caller runs each through the fence. Throws on bad name / type / system clash.
 */
export function buildAddColumnSql(tableName: string, field: CollectionField): string {
  if (!isContentName(tableName)) {
    throw new Error(`table name must match content_* : ${JSON.stringify(tableName)}`);
  }
  assertFieldName(field.name);
  if (!COLLECTION_FIELD_TYPES.has(field.type)) {
    throw new Error(`unknown field type: ${JSON.stringify(field.type)} for field ${field.name}`);
  }
  const aff = affinityFor(field.type);
  // SQLite ADD COLUMN can't add a NOT NULL column without a default; if required
  // but no default, fall back to NULL-able (the app-level validator enforces the
  // requiredness on writes). Otherwise honor NOT NULL + DEFAULT.
  const def = defaultLiteral(field);
  const notNull = field.required && def ? " NOT NULL" : "";
  return `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${aff}${notNull}${def}`;
}

/** Derive the `content_<slug>` table name from a collection slug. PURE. */
export function tableNameForSlug(slug: string): string {
  const clean = String(slug).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `content_${clean}`;
}

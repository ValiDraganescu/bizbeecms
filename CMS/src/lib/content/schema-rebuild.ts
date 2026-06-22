/**
 * content-collections — Phase 2 EXTRA: the drop/rename-field schema-evolution
 * PLANNER (PURE).
 *
 * v1 schema evolution was ADD-ONLY (`buildAddColumnSql`, fenced ALTER ADD COLUMN).
 * Dropping or renaming a field can't ride a single safe ALTER on SQLite/D1's
 * limited ALTER (and we deliberately avoid relying on `ALTER … DROP/RENAME COLUMN`
 * so the path is identical regardless of the SQLite build) — instead we do the
 * canonical safe **table-rebuild dance** (USER DECISION, CAVEAT):
 *
 *   1. CREATE TABLE content_<slug>_new ( … revised schema … )   ← Slice-1 generator
 *   2. INSERT INTO content_<slug>_new (kept/renamed cols) SELECT (old cols) FROM content_<slug>
 *   3. DROP TABLE content_<slug>
 *   4. ALTER TABLE content_<slug>_new RENAME TO content_<slug>
 *
 * This module is PURE (no I/O, no D1): it returns the ORDERED list of statements
 * plus the UPDATED registry field schema. A thin live store (later slice) runs
 * each statement through the Slice-0 fence (`contentDdl`) inside whatever atomic
 * boundary D1 gives us, then writes the new schema JSON to the `collection`
 * registry. EVERY emitted statement is fence-safe BY CONSTRUCTION and the tests
 * re-assert it via `assertStatement` — never trust "by construction" alone
 * (CAVEAT).
 *
 * Scope of THIS slice (per the task): pure planner + heavy node tests ONLY. NO
 * execution wiring, NO UI, NO i18n, NO bundle regen.
 */

import { assertStatement } from "./fence.ts";
import {
  buildCreateTableSql,
  SYSTEM_COLUMNS,
  type CollectionField,
} from "./collection-schema.ts";

/** Same strict column charset as the generator — a name can never inject SQL. */
const COLUMN_NAME_RE = /^[a-z][a-z0-9_]*$/;
const SYSTEM_COLUMN_SET: ReadonlySet<string> = new Set(SYSTEM_COLUMNS);

/** The temp-table suffix used during a rebuild. content_<slug>_new is fence-safe. */
export const REBUILD_SUFFIX = "_new";

/** The current (pre-change) logical schema of a collection, from the registry. */
export interface CollectionSchema {
  /** The real `content_<slug>` table name (already fenced/validated on create). */
  tableName: string;
  /** The user-defined fields (system columns are implicit, NOT listed here). */
  fields: CollectionField[];
}

/** A drop or rename of ONE user field. */
export type SchemaChange =
  | { op: "drop"; field: string }
  | { op: "rename"; field: string; to: string };

/** What the planner produces on success. */
export interface RebuildPlan {
  /** The ordered, fence-safe statements to run (each a SINGLE statement). */
  statements: string[];
  /** The revised registry schema to persist AFTER the statements succeed. */
  newSchema: CollectionSchema;
  /** The temp table name used mid-rebuild (content_<slug>_new). */
  tempTableName: string;
}

/** PlanResult shape shared with the other content planners (Slice-2 pattern). */
export type PlanResult<T> =
  | { ok: true; plan: T }
  | { ok: false; status: number; error: string };

function fail(status: number, error: string): PlanResult<never> {
  return { ok: false, status, error };
}

/**
 * Plan a safe table-rebuild that drops or renames ONE user field. PURE.
 *
 * Returns `{ ok:false, status, error }` for any bad input (unknown field,
 * non-content table, bad new name, system-column clash, collision) so a store
 * can map it straight to an HTTP status; `{ ok:true, plan }` otherwise.
 */
export function planRebuild(
  schema: CollectionSchema,
  change: SchemaChange,
): PlanResult<RebuildPlan> {
  // --- validate the table name (must be a real content_* name) ---
  if (!schema || typeof schema.tableName !== "string") {
    return fail(400, "schema.tableName is required");
  }
  const tableName = schema.tableName;
  if (!/^content_[a-z0-9_]+$/.test(tableName)) {
    return fail(400, `not a content_* table: ${JSON.stringify(tableName)}`);
  }
  if (!Array.isArray(schema.fields)) {
    return fail(400, "schema.fields must be an array");
  }

  // The temp table must ALSO be a valid content_* name (it always is, but assert).
  const tempTableName = `${tableName}${REBUILD_SUFFIX}`;
  if (!/^content_[a-z0-9_]+$/.test(tempTableName)) {
    return fail(400, `derived temp name is not content_*: ${tempTableName}`);
  }

  const oldFields = schema.fields;
  const oldNames = new Set(oldFields.map((f) => f && f.name));

  // --- validate the change references an existing user field ---
  if (!change || (change.op !== "drop" && change.op !== "rename")) {
    return fail(400, `unsupported change op: ${JSON.stringify((change as { op?: unknown })?.op)}`);
  }
  if (typeof change.field !== "string" || !change.field) {
    return fail(400, "change.field is required");
  }
  if (SYSTEM_COLUMN_SET.has(change.field)) {
    return fail(400, `cannot ${change.op} a system column: ${change.field}`);
  }
  if (!oldNames.has(change.field)) {
    return fail(404, `unknown field: ${change.field}`);
  }

  // --- compute the new field list + the column copy mapping ---
  // copyPairs: [oldColName, newColName] for the INSERT…SELECT (system cols always
  // carried verbatim; user cols kept/renamed; dropped col omitted).
  const newFields: CollectionField[] = [];
  const userCopy: Array<[string, string]> = [];

  if (change.op === "drop") {
    for (const f of oldFields) {
      if (f.name === change.field) continue; // drop it
      newFields.push(f);
      userCopy.push([f.name, f.name]);
    }
  } else {
    // rename
    const to = change.to;
    if (typeof to !== "string" || !COLUMN_NAME_RE.test(to)) {
      return fail(400, `invalid new field name: ${JSON.stringify(to)} (must match ${COLUMN_NAME_RE})`);
    }
    if (SYSTEM_COLUMN_SET.has(to)) {
      return fail(400, `new field name collides with a system column: ${to}`);
    }
    if (to !== change.field && oldNames.has(to)) {
      return fail(409, `new field name already exists: ${to}`);
    }
    for (const f of oldFields) {
      if (f.name === change.field) {
        newFields.push({ ...f, name: to });
        userCopy.push([f.name, to]);
      } else {
        newFields.push(f);
        userCopy.push([f.name, f.name]);
      }
    }
  }

  // --- build the statements ---
  let createSql: string;
  try {
    // The Slice-1 generator validates names/types/cap/system-clash and is
    // fence-safe by construction. If the new schema is invalid (shouldn't be,
    // since we only kept/renamed existing fields), surface it as a 400.
    createSql = buildCreateTableSql(tempTableName, newFields);
  } catch (e) {
    return fail(400, `cannot generate new table: ${(e as Error).message}`);
  }

  // The columns to copy: all 6 system columns verbatim, then the kept/renamed
  // user columns. Names are NOT user-controlled literals here — system columns
  // are fixed and user column names passed COLUMN_NAME_RE on creation (re-checked
  // below so a corrupted registry can't inject).
  const newCols: string[] = [...SYSTEM_COLUMNS];
  const oldCols: string[] = [...SYSTEM_COLUMNS];
  for (const [oldName, newName] of userCopy) {
    if (!COLUMN_NAME_RE.test(oldName) || !COLUMN_NAME_RE.test(newName)) {
      return fail(400, `unsafe column name in copy: ${oldName}->${newName}`);
    }
    oldCols.push(oldName);
    newCols.push(newName);
  }
  const insertSql =
    `INSERT INTO ${tempTableName} (${newCols.join(", ")}) ` +
    `SELECT ${oldCols.join(", ")} FROM ${tableName}`;

  const dropSql = `DROP TABLE ${tableName}`;
  const renameSql = `ALTER TABLE ${tempTableName} RENAME TO ${tableName}`;

  const statements = [createSql, insertSql, dropSql, renameSql];

  // DON'T trust "fence-safe by construction" — assert every statement clears the
  // fence right here (CAVEAT). If any fails, it's a generator bug, not user input.
  for (const sql of statements) {
    try {
      assertStatement(sql, "write");
    } catch (e) {
      return fail(500, `generated statement failed the fence: ${(e as Error).message}`);
    }
  }

  return {
    ok: true,
    plan: {
      statements,
      newSchema: { tableName, fields: newFields },
      tempTableName,
    },
  };
}

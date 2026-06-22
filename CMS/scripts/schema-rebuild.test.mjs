/**
 * content-collections Phase-2 EXTRA — tests for the drop/rename-field
 * schema-evolution REBUILD planner (PURE).
 *
 * SQLite/D1 ALTER is limited, so dropping/renaming a field is done via the safe
 * table-rebuild dance: CREATE content_<slug>_new → INSERT…SELECT (kept/renamed
 * cols) → DROP old → RENAME new. This planner is PURE and emits that ORDERED list
 * of statements + the updated registry schema. Load-bearing assertions:
 *  - EVERY emitted statement passes the Slice-0 fence (assertStatement write);
 *  - rebuild order is exactly CREATE, INSERT…SELECT, DROP, RENAME;
 *  - rename maps the old column's VALUES into the new column (positional copy);
 *  - drop OMITS the column from both the new table and the copy;
 *  - all targets are content_* (temp table = content_<slug>_new);
 *  - attack/invalid inputs are rejected (unknown field, system column, bad new
 *    name, collision, non-content table, injection via field name).
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { assertStatement, validateStatement } from "../src/lib/content/fence.ts";
import { SYSTEM_COLUMNS } from "../src/lib/content/collection-schema.ts";
import { planRebuild, REBUILD_SUFFIX } from "../src/lib/content/schema-rebuild.ts";

const TABLE = "content_posts";
const schema = () => ({
  tableName: TABLE,
  fields: [
    { name: "title", type: "string", required: true },
    { name: "body", type: "richtext" },
    { name: "views", type: "int", default: 0 },
  ],
});

function ok(res) {
  assert.equal(res.ok, true, `expected ok, got: ${JSON.stringify(res)}`);
  return res.plan;
}
function err(res) {
  assert.equal(res.ok, false, `expected error, got: ${JSON.stringify(res)}`);
  return res;
}

// ---------------------------------------------------------------------------
// Happy path — DROP
// ---------------------------------------------------------------------------
test("drop: emits CREATE, INSERT…SELECT, DROP, RENAME in order", () => {
  const plan = ok(planRebuild(schema(), { op: "drop", field: "body" }));
  assert.equal(plan.statements.length, 4);
  assert.match(plan.statements[0], /^CREATE TABLE content_posts_new /);
  assert.match(plan.statements[1], /^INSERT INTO content_posts_new \(.*\) SELECT .* FROM content_posts$/);
  assert.equal(plan.statements[2], "DROP TABLE content_posts");
  assert.equal(plan.statements[3], "ALTER TABLE content_posts_new RENAME TO content_posts");
  assert.equal(plan.tempTableName, `content_posts${REBUILD_SUFFIX}`);
});

test("drop: the dropped column is omitted from the new table and the copy", () => {
  const plan = ok(planRebuild(schema(), { op: "drop", field: "body" }));
  // new schema no longer has the field
  assert.deepEqual(plan.newSchema.fields.map((f) => f.name), ["title", "views"]);
  // CREATE doesn't declare it
  assert.doesNotMatch(plan.statements[0], /\bbody\b/);
  // INSERT…SELECT doesn't copy it
  assert.doesNotMatch(plan.statements[1], /\bbody\b/);
  // surviving columns ARE copied
  assert.match(plan.statements[1], /\btitle\b/);
  assert.match(plan.statements[1], /\bviews\b/);
});

test("drop: system columns are always carried verbatim in the copy", () => {
  const plan = ok(planRebuild(schema(), { op: "drop", field: "views" }));
  for (const c of SYSTEM_COLUMNS) {
    assert.match(plan.statements[1], new RegExp(`\\b${c}\\b`), `system col ${c} not copied`);
  }
});

// ---------------------------------------------------------------------------
// Happy path — RENAME
// ---------------------------------------------------------------------------
test("rename: new table uses the new name, copy maps old→new positionally", () => {
  const plan = ok(planRebuild(schema(), { op: "rename", field: "body", to: "content" }));
  assert.deepEqual(plan.newSchema.fields.map((f) => f.name), ["title", "content", "views"]);
  // CREATE has the new name, not the old
  assert.match(plan.statements[0], /\bcontent\b/);
  assert.doesNotMatch(plan.statements[0], /\bbody\b/);
  // INSERT target list has new name; SELECT source list has old name
  const [, insertTarget, insertSource] = plan.statements[1].match(
    /^INSERT INTO content_posts_new \(([^)]*)\) SELECT (.*) FROM content_posts$/,
  );
  assert.match(insertTarget, /\bcontent\b/);
  assert.doesNotMatch(insertTarget, /\bbody\b/);
  assert.match(insertSource, /\bbody\b/);
  assert.doesNotMatch(insertSource, /\bcontent\b/);
  // positional: same number of columns on both sides
  assert.equal(insertTarget.split(",").length, insertSource.split(",").length);
});

test("rename: renamed field keeps its type/required/default", () => {
  const plan = ok(planRebuild(schema(), { op: "rename", field: "views", to: "hits" }));
  const renamed = plan.newSchema.fields.find((f) => f.name === "hits");
  assert.equal(renamed.type, "int");
  assert.equal(renamed.default, 0);
});

test("rename to the SAME name is a no-op rename (allowed, copies straight)", () => {
  const plan = ok(planRebuild(schema(), { op: "rename", field: "title", to: "title" }));
  assert.deepEqual(plan.newSchema.fields.map((f) => f.name), ["title", "body", "views"]);
});

// ---------------------------------------------------------------------------
// Fence safety — EVERY emitted statement clears assertStatement("write")
// ---------------------------------------------------------------------------
test("every emitted statement passes the Slice-0 fence (drop + rename)", () => {
  for (const change of [
    { op: "drop", field: "body" },
    { op: "drop", field: "title" },
    { op: "rename", field: "views", to: "hits" },
    { op: "rename", field: "body", to: "article_body" },
  ]) {
    const plan = ok(planRebuild(schema(), change));
    for (const sql of plan.statements) {
      assert.doesNotThrow(() => assertStatement(sql, "write"), `fence rejected: ${sql}`);
      assert.equal(validateStatement(sql, "write").ok, true);
    }
  }
});

test("dropping the LAST user field still yields fence-safe statements", () => {
  const single = { tableName: "content_tags", fields: [{ name: "label", type: "string" }] };
  const plan = ok(planRebuild(single, { op: "drop", field: "label" }));
  assert.deepEqual(plan.newSchema.fields, []);
  for (const sql of plan.statements) {
    assert.doesNotThrow(() => assertStatement(sql, "write"));
  }
  // copy still carries the system columns
  for (const c of SYSTEM_COLUMNS) {
    assert.match(plan.statements[1], new RegExp(`\\b${c}\\b`));
  }
});

// ---------------------------------------------------------------------------
// content_* targeting only
// ---------------------------------------------------------------------------
test("all statements target content_* objects only (temp = content_<slug>_new)", () => {
  const plan = ok(planRebuild(schema(), { op: "drop", field: "body" }));
  for (const sql of plan.statements) {
    assert.match(sql, /content_posts/);
  }
  assert.match(plan.statements[0], /content_posts_new/);
  assert.match(plan.statements[3], /content_posts_new RENAME TO content_posts/);
});

// ---------------------------------------------------------------------------
// Rejections / attack inputs
// ---------------------------------------------------------------------------
test("rejects an unknown field with 404", () => {
  assert.equal(err(planRebuild(schema(), { op: "drop", field: "nope" })).status, 404);
  assert.equal(err(planRebuild(schema(), { op: "rename", field: "nope", to: "x" })).status, 404);
});

test("rejects dropping/renaming a SYSTEM column with 400", () => {
  for (const c of SYSTEM_COLUMNS) {
    assert.equal(err(planRebuild(schema(), { op: "drop", field: c })).status, 400);
    assert.equal(err(planRebuild(schema(), { op: "rename", field: c, to: "x" })).status, 400);
  }
});

test("rejects renaming TO a system column or an existing field", () => {
  assert.equal(err(planRebuild(schema(), { op: "rename", field: "title", to: "status" })).status, 400);
  assert.equal(err(planRebuild(schema(), { op: "rename", field: "title", to: "id" })).status, 400);
  // collide with an existing user field → 409
  assert.equal(err(planRebuild(schema(), { op: "rename", field: "title", to: "body" })).status, 409);
});

test("rejects an invalid new field name (injection / bad charset)", () => {
  for (const bad of [
    "Bad",                         // uppercase
    "1leading",                    // leading digit
    "has space",
    "drop_table; --",
    'a") FROM content_posts;--',
    "x-y",
  ]) {
    const res = planRebuild(schema(), { op: "rename", field: "title", to: bad });
    assert.equal(res.ok, false, `should reject new name ${JSON.stringify(bad)}`);
    assert.equal(res.status, 400);
  }
});

test("rejects a non-content table name", () => {
  assert.equal(err(planRebuild({ tableName: "page", fields: [] }, { op: "drop", field: "x" })).status, 400);
  assert.equal(err(planRebuild({ tableName: "posts", fields: [] }, { op: "drop", field: "x" })).status, 400);
  assert.equal(err(planRebuild({ tableName: "content_;DROP", fields: [] }, { op: "drop", field: "x" })).status, 400);
});

test("rejects an unsupported op and missing fields", () => {
  assert.equal(err(planRebuild(schema(), { op: "retype", field: "title" })).status, 400);
  assert.equal(err(planRebuild(schema(), { op: "drop" })).status, 400);
  assert.equal(err(planRebuild({ tableName: TABLE }, { op: "drop", field: "title" })).status, 400);
});

test("a corrupted registry field name in the kept set is rejected, not inlined", () => {
  const dirty = {
    tableName: TABLE,
    fields: [
      { name: "title", type: "string" },
      { name: "bad; DROP TABLE page;--", type: "string" },
    ],
  };
  // dropping the clean field forces the dirty one into the copy → must be caught
  const res = planRebuild(dirty, { op: "drop", field: "title" });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

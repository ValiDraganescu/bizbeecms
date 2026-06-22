/**
 * content-collections Slice 2 — tests for the PURE create / add-field planners.
 *
 * The planners own the load-bearing decisions of the runtime-DDL routes: the
 * 100-collection cap, `content_<slug>` derivation, name-collision rejection, and
 * generating the DDL. They're pure, so they're driven here directly (no D1) — and
 * every generated DDL string is asserted to PASS the Slice-0 fence, the whole
 * feature's safety boundary.
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  planCreate,
  planAddField,
  normalizeFields,
  normalizeField,
  MAX_COLLECTIONS,
} from "../src/lib/content/collection-plan.ts";
import { validateStatement } from "../src/lib/content/fence.ts";

const fenced = (sql) =>
  assert.equal(validateStatement(sql, "write").ok, true, `DDL must pass the fence: ${sql}`);

test("planCreate derives content_<slug>, generates a fence-safe CREATE, normalizes fields", () => {
  const r = planCreate("Blog Posts", [{ name: "title", type: "string", required: true }], 3, ["content_authors"]);
  assert.equal(r.ok, true);
  assert.equal(r.plan.tableName, "content_blog_posts");
  assert.equal(r.plan.name, "Blog Posts");
  assert.deepEqual(r.plan.fields, [{ name: "title", type: "string", required: true }]);
  assert.match(r.plan.createSql, /^CREATE TABLE content_blog_posts/);
  // system columns present
  assert.match(r.plan.createSql, /id TEXT PRIMARY KEY/);
  assert.match(r.plan.createSql, /title TEXT NOT NULL/);
  fenced(r.plan.createSql);
});

test("planCreate rejects when the collection cap is reached (409)", () => {
  const r = planCreate("Anything", [], MAX_COLLECTIONS, []);
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.match(r.error, /cap/);
  // one under the cap is fine
  const ok = planCreate("Anything", [], MAX_COLLECTIONS - 1, []);
  assert.equal(ok.ok, true);
});

test("planCreate rejects a name-collision against the existing registry (409)", () => {
  const r = planCreate("Posts", [], 1, ["content_posts"]);
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.match(r.error, /already exists/);
});

test("planCreate rejects an empty / slugless name (400)", () => {
  assert.equal(planCreate("", [], 0, []).status, 400);
  assert.equal(planCreate("   ", [], 0, []).status, 400);
  assert.equal(planCreate("!!!", [], 0, []).status, 400); // slug → empty
});

test("planCreate surfaces generator errors as 400 (bad field type / system clash)", () => {
  const badType = planCreate("X", [{ name: "f", type: "nope" }], 0, []);
  assert.equal(badType.ok, false);
  assert.equal(badType.status, 400);

  const clash = planCreate("X", [{ name: "status", type: "string" }], 0, []);
  assert.equal(clash.ok, false);
  assert.equal(clash.status, 400);
  assert.match(clash.error, /reserved system column/);
});

test("planAddField generates a fence-safe ALTER and merges the field list", () => {
  const r = planAddField("content_posts", [{ name: "title", type: "string" }], { name: "views", type: "int" });
  assert.equal(r.ok, true);
  assert.match(r.plan.alterSql, /^ALTER TABLE content_posts ADD COLUMN views INTEGER/);
  assert.deepEqual(r.plan.fields, [
    { name: "title", type: "string" },
    { name: "views", type: "int" },
  ]);
  fenced(r.plan.alterSql);
});

test("planAddField rejects a duplicate field (409) and a missing body (400)", () => {
  const dup = planAddField("content_posts", [{ name: "title", type: "string" }], { name: "title", type: "text" });
  assert.equal(dup.status, 409);
  assert.match(dup.error, /already exists/);

  assert.equal(planAddField("content_posts", [], null).status, 400);
  assert.equal(planAddField("content_posts", [], { name: "x" }).status, 400); // no type
});

test("planAddField rejects a system-column collision (400)", () => {
  const r = planAddField("content_posts", [], { name: "created_at", type: "datetime" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("normalizeField/normalizeFields drop junk and keep valid descriptors", () => {
  assert.equal(normalizeField(null), null);
  assert.equal(normalizeField({ name: "x" }), null); // no type
  assert.deepEqual(normalizeField({ name: " x ", type: "string", required: true, junk: 1 }), {
    name: "x",
    type: "string",
    required: true,
  });
  assert.deepEqual(
    normalizeFields([{ name: "a", type: "int" }, "garbage", { type: "string" }]),
    [{ name: "a", type: "int" }],
  );
  // options + default carried through
  const f = normalizeField({ name: "s", type: "select", default: "x", options: [{ value: "x", label: "X" }, { bad: 1 }] });
  assert.equal(f.default, "x");
  assert.deepEqual(f.options, [{ value: "x", label: "X" }]);
});

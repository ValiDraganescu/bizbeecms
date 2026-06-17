// Dep-free regression test for the A1 D1 schema migration.
// Run: node --test scripts/schema-migration.test.mjs
// Asserts the generated migration encodes the settled {tree,script,css}
// artifact model + the page block tree, so a schema reshape can't silently
// drop a column the renderer/AI tools depend on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const migDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const sqlFiles = readdirSync(migDir).filter((f) => f.endsWith(".sql"));
const sql = sqlFiles.map((f) => readFileSync(join(migDir, f), "utf8")).join("\n");

test("component table stores the {tree,script,css} artifact, not JSX source", () => {
  assert.match(sql, /CREATE TABLE `component`/);
  for (const col of ["`tree`", "`script`", "`css`", "`props_schema`", "`name`"]) {
    assert.match(sql, new RegExp(col.replace(/[`]/g, "\\`")), `component missing ${col}`);
  }
  // Architecture guard: no raw JSX/TSX source column (eval is permanently out).
  assert.doesNotMatch(sql, /`source`/, "component must NOT store raw JSX source");
  assert.match(sql, /component_name_unique/, "component name must be unique");
});

test("page table stores a block tree + hierarchy + per-locale SEO", () => {
  assert.match(sql, /CREATE TABLE `page`/);
  for (const col of ["`slug`", "`parent_page_id`", "`blocks`", "`meta_title`", "`publish_status`"]) {
    assert.match(sql, new RegExp(col.replace(/[`]/g, "\\`")), `page missing ${col}`);
  }
  // Slug unique per parent (siblings can't collide; same slug ok at other levels).
  assert.match(sql, /page_parent_slug_unique.*parent_page_id.*slug/s);
});

test("no aicms domain/entity tables leaked in (content is generic)", () => {
  for (const t of ["artwork", "product", "order", "blog_post", "discount"]) {
    assert.doesNotMatch(sql, new RegExp("CREATE TABLE `" + t + "`"), `must not model ${t}`);
  }
});

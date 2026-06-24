/**
 * content-collections Slice 0 — tests for the runtime-DDL/DML SAFETY fence.
 *
 * The fence is the whole feature's safety boundary (runtime DDL is only allowed
 * because of it), so this suite is adversarial: it asserts the validators ACCEPT
 * legitimate system-generated content_* statements and REJECT an attack corpus —
 * comment tricks, quoted/bracketed/backtick'd built-in refs, multi-statement
 * injection, PRAGMA/ATTACH escapes, and wrong-verb-for-mode.
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isContentName,
  isBuiltinName,
  validateStatement,
  assertStatement,
} from "../src/lib/content/fence.ts";
import { contentSelect, contentWrite, contentDdl, contentDdlBatch, MAX_READ_ROWS } from "../src/lib/content/content-db.ts";
import { buildCreateTableSql } from "../src/lib/content/collection-schema.ts";

const ok = (sql, mode) => assert.equal(validateStatement(sql, mode).ok, true, `should ACCEPT: ${sql}`);
const bad = (sql, mode) => assert.equal(validateStatement(sql, mode).ok, false, `should REJECT: ${sql}`);

test("isContentName accepts content_* and rejects everything else", () => {
  assert.equal(isContentName("content_posts"), true);
  assert.equal(isContentName("content_blog_2024"), true);
  assert.equal(isContentName("content_a"), true);
  // wrong / dangerous
  assert.equal(isContentName("content_"), false); // needs at least one trailing char
  assert.equal(isContentName("contentposts"), false);
  assert.equal(isContentName("Content_Posts"), false); // uppercase
  assert.equal(isContentName("content_posts; drop"), false);
  assert.equal(isContentName("content_posts--"), false);
  assert.equal(isContentName("page"), false);
  assert.equal(isContentName(""), false);
  assert.equal(isContentName(null), false);
  assert.equal(isContentName(42), false);
});

test("isBuiltinName flags all built-ins + sqlite_* internals", () => {
  for (const n of ["component", "page", "page_version", "site_settings", "asset", "chat_thread", "collection", "d1_migrations"]) {
    assert.equal(isBuiltinName(n), true, n);
    assert.equal(isBuiltinName(n.toUpperCase()), true, n.toUpperCase()); // case-insensitive
  }
  assert.equal(isBuiltinName("sqlite_master"), true);
  assert.equal(isBuiltinName("sqlite_sequence"), true);
  assert.equal(isBuiltinName("content_posts"), false);
});

test("ACCEPTS legitimate system-generated content_* statements", () => {
  ok("SELECT id, slug, title FROM content_posts WHERE status = ?", "read");
  ok("SELECT * FROM content_posts WHERE title LIKE ? ORDER BY created_at DESC LIMIT 50", "read");
  ok("SELECT count(*) FROM content_posts", "read");
  ok("CREATE TABLE content_posts (id INTEGER PRIMARY KEY, slug TEXT, title TEXT)", "write");
  ok("ALTER TABLE content_posts ADD COLUMN subtitle TEXT", "write");
  ok("DROP TABLE content_posts", "write");
  ok("INSERT INTO content_posts (slug, title) VALUES (?, ?)", "write");
  ok("UPDATE content_posts SET title = ? WHERE id = ?", "write");
  ok("DELETE FROM content_posts WHERE id = ?", "write");
});

test("REJECTS multi-statement injection (the classic)", () => {
  bad("SELECT * FROM content_posts; DROP TABLE page", "read");
  bad("SELECT * FROM content_posts; DROP TABLE page;--", "read");
  bad("DELETE FROM content_posts WHERE id = 1; DELETE FROM page", "write");
  // trailing semicolon alone is fine (single real statement)
  ok("SELECT id FROM content_posts;", "read");
});

test("REJECTS references to built-in tables even when quoted/bracketed/backticked", () => {
  bad('SELECT * FROM "page"', "read");
  bad("SELECT * FROM [page]", "read");
  bad("SELECT * FROM `page`", "read");
  bad('SELECT content_posts.id FROM content_posts JOIN "page" ON 1=1', "read");
  bad("DROP TABLE page", "write");
  bad("DROP TABLE collection", "write");
  bad("UPDATE site_settings SET v = ?", "write");
  bad("SELECT * FROM sqlite_master", "read");
  bad("DELETE FROM d1_migrations", "write");
});

test("REJECTS comment-hidden tricks (parses, not regexes)", () => {
  // a comment can't smuggle a second statement or hide a built-in
  bad("SELECT * FROM content_posts /* ; DROP TABLE page */ WHERE 1=1; DROP TABLE page", "read");
  bad("SELECT * FROM page -- content_posts", "read");
  // a built-in commented out but real target is still page
  bad("SELECT * FROM page /* content_posts */", "read");
  // comment-only noise around a valid statement is fine
  ok("/* create the table */ CREATE TABLE content_x (id INTEGER PRIMARY KEY) -- done", "write");
});

test("REJECTS PRAGMA / ATTACH / VACUUM / transaction escapes", () => {
  bad("PRAGMA writable_schema = 1", "write");
  bad("ATTACH DATABASE 'evil.db' AS evil", "write");
  bad("DETACH DATABASE evil", "write");
  bad("VACUUM", "write");
  bad("SELECT * FROM content_posts; PRAGMA table_info(page)", "read");
  bad("BEGIN; DROP TABLE content_posts; COMMIT", "write");
});

test("REJECTS wrong verb for the mode", () => {
  bad("DROP TABLE content_posts", "read"); // DDL on read path
  bad("DELETE FROM content_posts WHERE id = ?", "read"); // DML on read path
  bad("INSERT INTO content_posts (slug) VALUES (?)", "read");
  bad("SELECT * FROM content_posts", "write"); // SELECT on write path
});

test("REJECTS statements with no content_* target", () => {
  bad("SELECT 1", "read");
  bad("SELECT * FROM somethingelse", "read");
  bad("CREATE TABLE foo (id INTEGER)", "write"); // not content_-prefixed
  bad("", "read");
  bad("   ", "write");
});

test("assertStatement throws on invalid, passes on valid", () => {
  assert.throws(() => assertStatement("DROP TABLE page", "write"), /content fence rejected/);
  assert.doesNotThrow(() => assertStatement("SELECT id FROM content_posts", "read"));
});

// ---- content-db module: it MUST fence before touching D1 ----

function fakeD1() {
  const calls = [];
  const stmt = (sql) => {
    const s = { sql, params: [] };
    s.bind = (...p) => { s.params = p; return s; };
    s.all = async () => { calls.push({ kind: "all", sql: s.sql, params: s.params }); return { results: [{ id: 1 }] }; };
    s.run = async () => { calls.push({ kind: "run", sql: s.sql, params: s.params }); return { meta: { changes: 1 } }; };
    return s;
  };
  return {
    calls,
    prepare: (sql) => stmt(sql),
    exec: async (sql) => { calls.push({ kind: "exec", sql }); return {}; },
  };
}

test("contentSelect runs only fenced SELECTs and binds params", async () => {
  const d1 = fakeD1();
  const rows = await contentSelect("SELECT * FROM content_posts WHERE id = ?", [7], d1);
  assert.deepEqual(rows, [{ id: 1 }]);
  assert.equal(d1.calls[0].kind, "all");
  assert.deepEqual(d1.calls[0].params, [7]);
  // a non-SELECT must be rejected BEFORE any D1 call
  await assert.rejects(() => contentSelect("DELETE FROM content_posts", [], d1), /content fence rejected/);
});

test("contentWrite runs only fenced DML and returns change count", async () => {
  const d1 = fakeD1();
  const n = await contentWrite("INSERT INTO content_posts (slug) VALUES (?)", ["x"], d1);
  assert.equal(n, 1);
  await assert.rejects(() => contentWrite("DROP TABLE page", [], d1), /content fence rejected/);
});

test("contentDdl runs only fenced DDL via a single prepared statement", async () => {
  const d1 = fakeD1();
  await contentDdl("CREATE TABLE content_x (id INTEGER PRIMARY KEY)", d1);
  // Must use prepare().run() (NOT exec) — see regression test below for why.
  assert.equal(d1.calls[0].kind, "run");
  await assert.rejects(() => contentDdl("ATTACH DATABASE 'e' AS e", d1), /content fence rejected/);
  await assert.rejects(() => contentDdl("DROP TABLE collection", d1), /content fence rejected/);
});

// Regression — BUG [P1] 2026-06-24: creating a collection failed with
// `CREATE TABLE content_authors (: incomplete input`. Root cause: D1's exec()
// SPLITS on newlines and runs each line as its own statement, so the multi-line
// CREATE TABLE got chopped at the first `(`. The real generated DDL is multi-line
// (one column per line). This fake models exec()'s newline-splitting so the bug
// reproduces; the fix routes contentDdl through prepare().run() instead.
test("contentDdl handles multi-line generated DDL (D1 exec newline-split regression)", async () => {
  // The exact DDL the create flow generates for the reported repro:
  // collection "Authors", fields name(string,req) + bio(richtext,req).
  const createSql = buildCreateTableSql("content_authors", [
    { name: "name", type: "string", required: true },
    { name: "bio", type: "richtext", required: true },
  ]);
  assert.ok(createSql.includes("\n"), "generated CREATE TABLE is multi-line");
  assert.match(createSql, /name TEXT NOT NULL/);
  assert.match(createSql, /bio TEXT NOT NULL/);

  // A fake that faithfully models D1's exec() (newline-split → run each line) and
  // a sane prepare().run() (whole statement). exec() on the multi-line DDL would
  // throw on the first chopped line — exactly the production failure.
  let execFragments = null;
  const d1 = {
    prepare: (sql) => ({ run: async () => ({ meta: { changes: 0 } }) }),
    exec: async (sql) => {
      execFragments = sql.split("\n").map((l) => l.trim()).filter(Boolean);
      // first fragment is `CREATE TABLE content_authors (` → incomplete input
      if (!/\)\s*$/.test(execFragments[0])) {
        throw new Error("D1_EXEC_ERROR: incomplete input: SQLITE_ERROR");
      }
      return {};
    },
  };

  // Must NOT throw — the fix avoids exec() for multi-line DDL.
  await contentDdl(createSql, d1);
  assert.equal(execFragments, null, "contentDdl must not call the newline-splitting exec()");
});

// contentDdlBatch — schema-rebuild path: fence EVERY statement BEFORE D1, run
// them as ONE d1.batch() in order (atomic). A rejected statement aborts the WHOLE
// batch before any D1 call (no partial run).
test("contentDdlBatch fences every statement then runs them via d1.batch() in order", async () => {
  let batched = null;
  const d1 = {
    prepare: (sql) => ({ __sql: sql, run: async () => ({ meta: { changes: 0 } }) }),
    exec: async () => { throw new Error("must not exec"); },
    batch: async (stmts) => { batched = stmts.map((s) => s.__sql); return []; },
  };
  const sqls = [
    "CREATE TABLE content_x_new (id TEXT PRIMARY KEY)",
    "INSERT INTO content_x_new (id) SELECT id FROM content_x",
    "DROP TABLE content_x",
    "ALTER TABLE content_x_new RENAME TO content_x",
  ];
  await contentDdlBatch(sqls, d1);
  assert.deepEqual(batched, sqls, "all 4 statements batched IN ORDER");

  // One bad statement → reject BEFORE any batch call (atomic intent: nothing runs).
  let called = false;
  const d2 = {
    prepare: (sql) => ({ __sql: sql, run: async () => ({}) }),
    exec: async () => ({}),
    batch: async () => { called = true; return []; },
  };
  await assert.rejects(
    () => contentDdlBatch(["CREATE TABLE content_x_new (id TEXT)", "DROP TABLE page"], d2),
    /content fence rejected/,
  );
  assert.equal(called, false, "a single bad statement aborts the batch before any D1 call");
});

test("contentDdlBatch falls back to ordered run() when the binding has no batch()", async () => {
  const ran = [];
  const d1 = {
    prepare: (sql) => ({ run: async () => { ran.push(sql); return { meta: { changes: 0 } }; } }),
    exec: async () => { throw new Error("must not exec"); },
  };
  const sqls = ["DROP TABLE content_x", "ALTER TABLE content_x_new RENAME TO content_x"];
  await contentDdlBatch(sqls, d1);
  assert.deepEqual(ran, sqls, "no batch() → run each fenced statement in order");
});

test("MAX_READ_ROWS is a sane backstop", () => {
  assert.ok(MAX_READ_ROWS >= 100 && MAX_READ_ROWS <= 10000);
});

/**
 * content-collections — tests for the PURE import/export module.
 *
 * Covers CSV round-trip (quoting, embedded commas/newlines, escaped quotes),
 * JSON parse, dropping generated system columns on import, and the header→object
 * mapping. The route re-validates every row via createItem, so this only asserts
 * the SHAPE the route hands to the store.
 *
 * Dep-free `node --test`; imports the REAL .ts via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { rowsToCsv, parseCsv, parseImport } from "../src/lib/content/import-export.ts";

const fields = [
  { name: "title", type: "string" },
  { name: "body", type: "text" },
  { name: "count", type: "int" },
];

test("rowsToCsv: header is slug,status + user fields in order", () => {
  const csv = rowsToCsv([], fields);
  assert.equal(csv.split("\r\n")[0], "slug,status,title,body,count");
});

test("rowsToCsv: quotes cells with comma / quote / newline, escapes inner quotes", () => {
  const csv = rowsToCsv(
    [{ slug: "a", status: "draft", title: 'say "hi", now', body: "line1\nline2", count: 3 }],
    fields,
  );
  const row = csv.split("\r\n")[1];
  assert.equal(row, 'a,draft,"say ""hi"", now","line1\nline2",3');
});

test("rowsToCsv: null/undefined → empty cell", () => {
  const csv = rowsToCsv([{ slug: null, status: undefined, title: "x", body: "", count: 0 }], fields);
  assert.equal(csv.split("\r\n")[1], ",,x,,0");
});

test("parseCsv: round-trips quoted commas, newlines, escaped quotes", () => {
  const csv = rowsToCsv(
    [{ slug: "a", status: "draft", title: 'say "hi", now', body: "line1\nline2", count: 3 }],
    fields,
  );
  const table = parseCsv(csv);
  assert.deepEqual(table[0], ["slug", "status", "title", "body", "count"]);
  assert.deepEqual(table[1], ["a", "draft", 'say "hi", now', "line1\nline2", "3"]);
});

test("parseImport csv: maps header→object, keeps unknown cols, drops generated system cols", () => {
  const csv = "id,slug,status,title,created_at\nXYZ,hello,draft,Hi,123\n";
  const res = parseImport(csv, "csv");
  assert.equal(res.ok, true);
  assert.deepEqual(res.rows, [{ slug: "hello", status: "draft", title: "Hi" }]);
});

test("parseImport csv: blank trailing line is skipped, empty cells become ''", () => {
  const csv = "slug,title\na,\n\n";
  const res = parseImport(csv, "csv");
  assert.equal(res.ok, true);
  assert.deepEqual(res.rows, [{ slug: "a", title: "" }]);
});

test("parseImport json: array of objects, drops id/created_at", () => {
  const json = JSON.stringify([{ id: "x", slug: "a", title: "Hi", created_at: 9 }]);
  const res = parseImport(json, "json");
  assert.equal(res.ok, true);
  assert.deepEqual(res.rows, [{ slug: "a", title: "Hi" }]);
});

test("parseImport json: non-array / non-object / bad JSON → error", () => {
  assert.equal(parseImport("{}", "json").ok, false);
  assert.equal(parseImport("[1,2]", "json").ok, false);
  assert.equal(parseImport("not json", "json").ok, false);
});

test("parseImport csv: empty header → error; empty input → empty rows", () => {
  assert.equal(parseImport("", "csv").ok, true);
  assert.deepEqual(parseImport("", "csv").rows, []);
  assert.equal(parseImport(",,\n", "csv").ok, false);
});

// ── translatable fields (translatable-collections Slice 7) ───────────────────
// Export pulls rows through the store's parse seam, so a translatable column is a
// PARSED locale OBJECT at the export boundary. cellToString JSON.stringifies it →
// the canonical JSON string in the CSV cell → re-imports as that string → the
// write coerce stores it verbatim → the read seam re-parses it. Round-trips.
test("export: a translatable field's locale OBJECT serializes to its JSON string", () => {
  const tFields = [{ name: "name", type: "string", translatable: true }];
  const rows = [{ slug: "bistro", status: "published", name: { en: "Cosy", fi: "Viihtyisä" } }];
  const csv = rowsToCsv(rows, tFields);
  // The name cell holds the JSON string (quoted by CSV because it has commas/quotes).
  const parsed = parseImport(csv, "csv");
  assert.ok(parsed.ok);
  assert.equal(parsed.rows.length, 1);
  // On import it's a STRING (the JSON) — the write path stores it as-is and the
  // read seam parses it back, so this round-trips to the same locale object.
  assert.equal(parsed.rows[0].name, '{"en":"Cosy","fi":"Viihtyisä"}');
  assert.equal(parsed.rows[0].slug, "bistro");
});

test("export: a bare-string (untranslated/legacy) translatable value stays a plain string", () => {
  const tFields = [{ name: "name", type: "string", translatable: true }];
  const csv = rowsToCsv([{ slug: "x", status: "draft", name: "Legacy" }], tFields);
  const parsed = parseImport(csv, "csv");
  assert.ok(parsed.ok);
  assert.equal(parsed.rows[0].name, "Legacy");
});

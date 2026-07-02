/**
 * Dep-free unit tests for the Data Sources query textarea helpers
 * (src/lib/data-sources/query-lines.ts — pure, node type-stripped).
 * Run: node --test scripts/query-lines.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseQueryLines,
  serializeQuery,
} from "../src/lib/data-sources/query-lines.ts";

test("parseQueryLines: basic key=value pairs", () => {
  assert.deepEqual(parseQueryLines("a=1\nb=2"), { a: "1", b: "2" });
});

test("parseQueryLines: empty text and blank/whitespace-only lines skipped", () => {
  assert.deepEqual(parseQueryLines(""), {});
  assert.deepEqual(parseQueryLines("\n  \n\t\n"), {});
  assert.deepEqual(parseQueryLines("a=1\n\n  \nb=2"), { a: "1", b: "2" });
});

test("parseQueryLines: line without '=' becomes empty-string value", () => {
  assert.deepEqual(parseQueryLines("flag"), { flag: "" });
  assert.deepEqual(parseQueryLines("a=1\nflag"), { a: "1", flag: "" });
});

test("parseQueryLines: first '=' splits — value keeps later '='", () => {
  assert.deepEqual(parseQueryLines("expr=a=b=c"), { expr: "a=b=c" });
});

test("parseQueryLines: key and value are trimmed", () => {
  assert.deepEqual(parseQueryLines("  key  =  value  "), { key: "value" });
});

test("parseQueryLines: duplicate keys — last one wins", () => {
  assert.deepEqual(parseQueryLines("a=1\na=2"), { a: "2" });
});

test("parseQueryLines: empty value after '=' and leading '=' (empty key)", () => {
  assert.deepEqual(parseQueryLines("a="), { a: "" });
  assert.deepEqual(parseQueryLines("=v"), { "": "v" });
});

test("parseQueryLines: {placeholder} values pass through untouched", () => {
  assert.deepEqual(parseQueryLines("city={city}"), { city: "{city}" });
});

test("parseQueryLines: CRLF line endings — \\r trimmed with the line", () => {
  assert.deepEqual(parseQueryLines("a=1\r\nb=2\r\n"), { a: "1", b: "2" });
});

test("serializeQuery: object → lines, empty object → empty string", () => {
  assert.equal(serializeQuery({ a: "1", b: "2" }), "a=1\nb=2");
  assert.equal(serializeQuery({}), "");
  assert.equal(serializeQuery({ flag: "" }), "flag=");
});

test("round-trip: parse(serialize(q)) === q for clean input", () => {
  const q = { a: "1", city: "{city}", expr: "x=y" };
  assert.deepEqual(parseQueryLines(serializeQuery(q)), q);
});

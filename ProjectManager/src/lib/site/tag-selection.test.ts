import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTagRefs, resolveTagRefs } from "./tag-selection.ts";

const TAGS = [
  { id: "t1", label: "Company Group" },
  { id: "t2", label: "TO Channel" },
];

test("parseTagRefs: non-array → [], trims, drops empties, de-dupes", () => {
  assert.deepEqual(parseTagRefs(undefined), []);
  assert.deepEqual(parseTagRefs("t1"), []);
  assert.deepEqual(parseTagRefs([" t1 ", "", null, "t1", "t2"]), ["t1", "t2"]);
});

test("resolveTagRefs: ids and case-insensitive labels both resolve; unknowns reported", () => {
  const r = resolveTagRefs(["t1", "to channel", "nope"], TAGS);
  assert.deepEqual(r.ids, ["t1", "t2"]);
  assert.deepEqual(r.unknown, ["nope"]);
});

test("resolveTagRefs: id + label of the same tag collapse to one id", () => {
  assert.deepEqual(resolveTagRefs(["t1", "Company Group"], TAGS).ids, ["t1"]);
});

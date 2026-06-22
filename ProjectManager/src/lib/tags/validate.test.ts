import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseTagLabel, TAG_LABEL_MAX } from "./validate.ts";

test("rejects empty / whitespace-only labels", () => {
  for (const raw of ["", "   ", "\t\n", null, undefined]) {
    const r = parseTagLabel(raw);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "labelRequired");
  }
});

test("trims and collapses inner whitespace", () => {
  const r = parseTagLabel("  Nordic   Group  ");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.label, "Nordic Group");
});

test("accepts a normal label", () => {
  const r = parseTagLabel("TO channel");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.label, "TO channel");
});

test("rejects labels over the max length", () => {
  const r = parseTagLabel("x".repeat(TAG_LABEL_MAX + 1));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "labelTooLong");
});

test("accepts a label exactly at the max length", () => {
  const r = parseTagLabel("x".repeat(TAG_LABEL_MAX));
  assert.equal(r.ok, true);
});

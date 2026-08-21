import { test } from "node:test";
import assert from "node:assert/strict";
import { lintSectionBlocks } from "./lint-section-padding.mjs";

test("declared padding passes, explicit 0 passes", () => {
  const blocks = [
    { id: "b1", component: "Section", props: { name: "Hero", paddingTop: 0, paddingBottom: 0 } },
    { id: "b2", component: "Section", props: { name: "Story", paddingTop: 2, paddingBottom: 1.5 } },
  ];
  assert.deepEqual(lintSectionBlocks("/home", blocks), []);
});

test("missing sides are reported per section with page + section name", () => {
  const blocks = [
    { id: "b1", component: "Section", props: { name: "Info", paddingTop: 1 } },
    { id: "b9", component: "Section", props: {} },
  ];
  const errors = lintSectionBlocks("/contact", blocks);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /\/contact › "Info": paddingBottom not declared/);
  assert.match(errors[1], /\/contact › "b9": paddingTop \+ paddingBottom not declared/);
});

test("non-numeric padding counts as undeclared", () => {
  const blocks = [
    { id: "b1", component: "Section", props: { name: "S", paddingTop: "2", paddingBottom: 1 } },
  ];
  assert.equal(lintSectionBlocks("/p", blocks).length, 1);
});

test("non-Section top-level blocks and junk input are skipped", () => {
  assert.deepEqual(lintSectionBlocks("/p", [{ id: "x", component: "TextBlock" }]), []);
  assert.deepEqual(lintSectionBlocks("/p", null), []);
});

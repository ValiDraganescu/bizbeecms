import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECTION_COMPONENT,
  isSection,
  addSection,
  addComponentToSection,
  targetSectionId,
} from "./page-blocks.ts";
import type { Block } from "../render/tree.ts";

test("addSection appends an empty Section with a unique id", () => {
  const t0: Block[] = [];
  const t1 = addSection(t0);
  assert.equal(t1.length, 1);
  assert.equal(t1[0].component, SECTION_COMPONENT);
  assert.ok(isSection(t1[0]));
  assert.deepEqual(t1[0].children, []);
  assert.deepEqual(t0, [], "input is not mutated");

  const t2 = addSection(t1);
  assert.equal(t2.length, 2);
  assert.notEqual(t2[0].id, t2[1].id, "section ids are unique");
});

test("addComponentToSection appends a component block into the target section", () => {
  const t1 = addSection([]);
  const sid = t1[0].id;
  const t2 = addComponentToSection(t1, sid, "Hero");
  assert.equal(t2[0].children?.length, 1);
  assert.equal(t2[0].children?.[0].component, "Hero");
  assert.equal(t1[0].children?.length, 0, "input section not mutated");

  // ids stay unique across the whole tree, even same component twice.
  const t3 = addComponentToSection(t2, sid, "Hero");
  const ids = t3[0].children!.map((c) => c.id);
  assert.equal(new Set(ids).size, 2);
});

test("addComponentToSection is a no-op for a missing / non-section id", () => {
  const t1 = addSection([]);
  assert.deepEqual(addComponentToSection(t1, "nope", "Hero"), t1);
  // a plain (non-section) top-level block is not a drop target
  const withPlain: Block[] = [{ id: "h1", component: "Hero" }];
  assert.deepEqual(addComponentToSection(withPlain, "h1", "CTA"), withPlain);
});

test("targetSectionId: selected section wins, else last section, else null", () => {
  assert.equal(targetSectionId([], null), null);

  const two = addSection(addSection([]));
  const [a, b] = two;
  assert.equal(targetSectionId(two, null), b.id, "falls back to last section");
  assert.equal(targetSectionId(two, a.id), a.id, "selected section wins");

  // a selected non-section block falls back to the last section
  const mixed: Block[] = [{ id: "h1", component: "Hero" }, ...two];
  assert.equal(targetSectionId(mixed, "h1"), b.id);
});

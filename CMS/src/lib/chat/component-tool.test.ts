/**
 * Pure validation for create/update_component, focused on the tags branch
 * (component-kits). node --test, no @/ imports.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateComponentArtifact } from "./component-tool.ts";

const HTML = `<div class="p-4"><h2>{{t title}}</h2></div>`;

test("tags are normalized onto the artifact when supplied", () => {
  const v = validateComponentArtifact({ name: "Hero", html: HTML, tags: ["Hero", "hero", " BasicRestaurant "] });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.artifact.tags, ["BasicRestaurant", "Hero"]); // deduped, trimmed, sorted
});

test("omitted tags leave the artifact field undefined (update won't wipe existing)", () => {
  const v = validateComponentArtifact({ name: "Hero", html: HTML });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.artifact.tags, undefined);
});

test("explicit empty array clears tags ([], not undefined)", () => {
  const v = validateComponentArtifact({ name: "Hero", html: HTML, tags: [] });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.artifact.tags, []);
});

test("junk tags are dropped, not rejected (untrusted-list safe)", () => {
  const v = validateComponentArtifact({ name: "Hero", html: HTML, tags: ["ok", 1, null, "  "] });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.artifact.tags, ["ok"]);
});

test("label is trimmed when supplied; omitted → undefined; '' → '' (clears)", () => {
  const a = validateComponentArtifact({ name: "HeroEmozione", html: HTML, label: "  Hero — Emozione  " });
  assert.equal(a.ok, true);
  if (a.ok) assert.equal(a.artifact.label, "Hero — Emozione");

  const b = validateComponentArtifact({ name: "HeroEmozione", html: HTML });
  assert.equal(b.ok, true);
  if (b.ok) assert.equal(b.artifact.label, undefined);

  const c = validateComponentArtifact({ name: "HeroEmozione", html: HTML, label: "" });
  assert.equal(c.ok, true);
  if (c.ok) assert.equal(c.artifact.label, "");
});

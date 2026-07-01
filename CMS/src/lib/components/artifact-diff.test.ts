import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactUnchanged, type LiveArtifact } from "./artifact-diff.ts";

const live: LiveArtifact = {
  html: "<div>Hi</div>",
  script: "console.log(1)",
  css: ".a{color:red}",
  propsSchema: '{"x":{"type":"string"}}',
  label: "Card",
};

test("identical artifact → unchanged (no draft created on a no-op open/autosave)", () => {
  assert.equal(artifactUnchanged(live, { ...live }), true);
});

test("any single field differing → changed", () => {
  assert.equal(artifactUnchanged(live, { ...live, html: "<div>Bye</div>" }), false);
  assert.equal(artifactUnchanged(live, { ...live, script: "console.log(2)" }), false);
  assert.equal(artifactUnchanged(live, { ...live, css: ".a{color:blue}" }), false);
  assert.equal(artifactUnchanged(live, { ...live, propsSchema: null }), false);
  assert.equal(artifactUnchanged(live, { ...live, label: null }), false);
});

test("null props/label match null (no spurious change when both empty)", () => {
  const bare: LiveArtifact = { html: "<p/>", script: "", css: "", propsSchema: null, label: null };
  assert.equal(artifactUnchanged(bare, { ...bare }), true);
  assert.equal(artifactUnchanged(bare, { ...bare, label: "X" }), false);
});

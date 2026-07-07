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

// ── html equivalence is by PARSED TREE, not raw string ──────────────────────
// The Develop editor round-trips through formatHtml (pretty-printed) while the
// AI's edit_text writes compact markup: a raw compare let those echoes create
// a phantom "unpublished changes" draft right after publish (restovista,
// 2026-07-08). Same tree = unchanged, whatever the formatting.

test("formatting-only html differences are unchanged (editor/AI echo)", () => {
  const compact =
    '<header class="w-full"><div class="flex gap-2"><span>Hi</span><a href="/x">Go</a></div></header>';
  const pretty =
    '<header class="w-full">\n  <div class="flex gap-2">\n    <span>Hi</span>\n    <a href="/x">Go</a>\n  </div>\n</header>';
  assert.equal(artifactUnchanged({ ...live, html: compact }, { ...live, html: pretty }), true);
});

test("a REAL html change is still a change, however small", () => {
  assert.equal(
    artifactUnchanged(
      { ...live, html: '<div class="a">Hi</div>' },
      { ...live, html: '<div class="b">Hi</div>' },
    ),
    false,
  );
  assert.equal(
    artifactUnchanged({ ...live, html: "<div>Hi</div>" }, { ...live, html: "<div>Hi!</div>" }),
    false,
  );
});

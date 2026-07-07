// Pure tests for serializeComponent (portable bundle envelope).
// node --test does NOT resolve the @/ alias → import via relative .ts path.
//
// The one invariant worth pinning: `kind` is UI-only (like `label`) and must
// NEVER leak into the portable bundle — a jsonld component's kind is metadata
// for the Develop editor, not part of the cross-Site component payload. If this
// invariant breaks, importing a bundle would carry a phantom kind field.
import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeComponent, PORTABLE_FORMAT, type ComponentRow } from "./portable.ts";

const baseRow: ComponentRow = {
  name: "Widget",
  tree: JSON.stringify({ tag: "div", props: {}, children: [] }),
  script: "",
  css: "",
  propsSchema: null,
};

test("serializeComponent excludes kind from the bundle (UI-only, like label)", () => {
  const bundle = serializeComponent({ ...baseRow, kind: "jsonld" });
  assert.equal(bundle.format, PORTABLE_FORMAT);
  // The component payload carries only portable fields — no kind anywhere.
  assert.ok(!("kind" in (bundle.component as Record<string, unknown>)));
  assert.ok(!JSON.stringify(bundle).includes('"kind"'));
});

test("serializeComponent ignores kind for an html component too", () => {
  const bundle = serializeComponent({ ...baseRow, kind: "html" });
  assert.ok(!JSON.stringify(bundle).includes('"kind"'));
});

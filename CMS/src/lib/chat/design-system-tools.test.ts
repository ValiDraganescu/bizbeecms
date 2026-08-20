/**
 * Design-system list/get tools — pure lookup logic (node --test, no CF).
 * The library content itself is locked by scripts/design-systems.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { listDesignSystems, getDesignSystem } from "./design-system-tools.ts";

test("listDesignSystems returns slug/name/description but never the full content", () => {
  const res = listDesignSystems();
  assert.equal(res.ok, true);
  assert.ok(res.designSystems.length >= 1);
  for (const d of res.designSystems) {
    assert.ok(d.slug && d.name && d.description);
    assert.ok(!("content" in d), "list must stay light — content comes from get_design_system");
  }
});

test("getDesignSystem resolves by slug, case-insensitively, and by display name", () => {
  const first = listDesignSystems().designSystems[0];
  for (const key of [first.slug, first.slug.toUpperCase(), first.name]) {
    const res = getDesignSystem({ slug: key });
    assert.equal(res.ok, true, `lookup by ${JSON.stringify(key)}`);
    if (res.ok) assert.equal(res.designSystem.slug, first.slug);
  }
});

test("getDesignSystem names the bad slug and lists the available ones", () => {
  const res = getDesignSystem({ slug: "no-such-system" });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.errors[0], /no-such-system/);
    assert.match(res.errors[0], /nordic-fine-dining/);
  }
});

test("getDesignSystem rejects a missing slug with the fix", () => {
  for (const args of [undefined, null, {}, { slug: "  " }]) {
    const res = getDesignSystem(args);
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.errors[0], /list_design_systems/);
  }
});

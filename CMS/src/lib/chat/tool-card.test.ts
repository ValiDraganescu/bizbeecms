/**
 * ai-widget-ux — pure tests for the tool-card label/blob helpers.
 * Runs under `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toolSubject, toolSummary, formatBlob, blobView } from "./tool-card.ts";

test("subject: returns the component/page/target when distinct from name", () => {
  assert.equal(toolSubject({ name: "create_component", component: "Hero" }), "Hero");
  assert.equal(toolSubject({ name: "create_page", page: "/about" }), "/about");
  assert.equal(toolSubject({ name: "translate", target: "page-1" }), "page-1");
});

test("subject: undefined when there's no subject (no duplicate name)", () => {
  assert.equal(toolSubject({ name: "get_brand_identity" }), undefined);
});

test("subject: undefined when the subject equals the name", () => {
  assert.equal(toolSubject({ name: "list_pages", page: "list_pages" }), undefined);
});

test("summary: action + subject", () => {
  assert.equal(toolSummary({ name: "create_component", action: "created", component: "Hero" }), "created Hero");
});

test("summary: action only when no subject", () => {
  assert.equal(toolSummary({ name: "get_brand_identity", action: "ok" }), "ok");
});

test("summary: empty for a bare tool (no action, no subject)", () => {
  assert.equal(toolSummary({ name: "get_brand_identity" }), "");
});

test("formatBlob: pretty-prints objects, passes strings through", () => {
  assert.equal(formatBlob({ a: 1 }), '{\n  "a": 1\n}');
  assert.equal(formatBlob("hello"), "hello");
  assert.equal(formatBlob(undefined), "");
});

test("formatBlob: truncates huge values", () => {
  const out = formatBlob("x".repeat(5000), 100);
  assert.ok(out.startsWith("x".repeat(100)));
  assert.ok(out.includes("more chars"));
});

test("blobView: not truncated when within max — preview equals full", () => {
  const v = blobView("hello", 100);
  assert.equal(v.truncated, false);
  assert.equal(v.hidden, 0);
  assert.equal(v.preview, "hello");
  assert.equal(v.full, "hello");
});

test("blobView: truncated keeps full text + correct hidden count", () => {
  const v = blobView("x".repeat(5000), 100);
  assert.equal(v.truncated, true);
  assert.equal(v.hidden, 4900);
  assert.equal(v.full.length, 5000);
  assert.ok(v.preview.length < v.full.length);
  assert.ok(v.preview.includes("4900 more chars"));
});

test("blobView: undefined → empty, never truncated", () => {
  const v = blobView(undefined);
  assert.equal(v.full, "");
  assert.equal(v.truncated, false);
});

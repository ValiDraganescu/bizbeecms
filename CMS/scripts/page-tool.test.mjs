/**
 * Dep-free unit tests for the create-page tool's pure validator (epic B3).
 * Run: node --test scripts/page-tool.test.mjs
 *
 * Imports the TS module directly via Node type-stripping (project convention;
 * no @/ alias — that's why page-tool.ts imports render/tree.ts relatively).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePageInput,
  CREATE_PAGE_TOOL,
} from "../src/lib/chat/page-tool.ts";

// ── tool schema ──────────────────────────────────────────────────────────────
test("CREATE_PAGE_TOOL: well-formed OpenAI function schema", () => {
  assert.equal(CREATE_PAGE_TOOL.type, "function");
  assert.equal(CREATE_PAGE_TOOL.function.name, "create_page");
  assert.deepEqual(CREATE_PAGE_TOOL.function.parameters.required, ["slug", "blocks"]);
});

// ── happy path ───────────────────────────────────────────────────────────────
test("validate: accepts a minimal valid page", () => {
  const res = validatePageInput({
    slug: "home",
    blocks: [{ id: "b1", component: "Hero" }],
  });
  assert.equal(res.ok, true);
  assert.equal(res.page.slug, "home");
  assert.equal(res.page.parentSlug, null);
  assert.equal(res.page.publishStatus, "draft");
  assert.deepEqual(res.componentNames, ["Hero"]);
});

test("validate: collects distinct component names across nested blocks", () => {
  const res = validatePageInput({
    slug: "pricing",
    publishStatus: "published",
    blocks: [
      {
        id: "wrap",
        component: "Section",
        children: [
          { id: "a", component: "PricingCard" },
          { id: "b", component: "PricingCard" },
          { id: "c", component: "CtaButton" },
        ],
      },
    ],
  });
  assert.equal(res.ok, true);
  assert.equal(res.page.publishStatus, "published");
  assert.deepEqual(res.componentNames.sort(), ["CtaButton", "PricingCard", "Section"]);
});

test("validate: accepts blocks as a JSON string (open-model shape)", () => {
  const res = validatePageInput({
    slug: "about",
    blocks: JSON.stringify([{ id: "b1", component: "Hero" }]),
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.componentNames, ["Hero"]);
});

test("validate: accepts a parentSlug and per-locale meta", () => {
  const res = validatePageInput({
    slug: "hello-world",
    parentSlug: "blog",
    blocks: [{ id: "b1", component: "PostBody" }],
    metaTitle: { en: "Hello", fi: "Hei" },
    metaDescription: { en: "A post" },
  });
  assert.equal(res.ok, true);
  assert.equal(res.page.parentSlug, "blog");
  assert.deepEqual(res.page.metaTitle, { en: "Hello", fi: "Hei" });
});

// ── rejections ───────────────────────────────────────────────────────────────
test("validate: rejects non-object args", () => {
  const res = validatePageInput("nope");
  assert.equal(res.ok, false);
});

test("validate: rejects a bad slug (uppercase / spaces)", () => {
  const res = validatePageInput({ slug: "My Page", blocks: [{ id: "b", component: "X" }] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("slug")));
});

test("validate: rejects an empty slug", () => {
  const res = validatePageInput({ slug: "", blocks: [{ id: "b", component: "X" }] });
  assert.equal(res.ok, false);
});

test("validate: rejects a bad publishStatus", () => {
  const res = validatePageInput({
    slug: "x",
    publishStatus: "live",
    blocks: [{ id: "b", component: "X" }],
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("publishStatus")));
});

test("validate: rejects a bad parentSlug", () => {
  const res = validatePageInput({
    slug: "x",
    parentSlug: "Bad Parent",
    blocks: [{ id: "b", component: "X" }],
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("parentSlug")));
});

test("validate: rejects blocks that aren't an array", () => {
  const res = validatePageInput({ slug: "x", blocks: { id: "b", component: "X" } });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("blocks")));
});

test("validate: rejects a block missing an id", () => {
  const res = validatePageInput({ slug: "x", blocks: [{ component: "X" }] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("id")));
});

test("validate: rejects a block missing a component name", () => {
  const res = validatePageInput({ slug: "x", blocks: [{ id: "b" }] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("component")));
});

test("validate: rejects non-array children", () => {
  const res = validatePageInput({
    slug: "x",
    blocks: [{ id: "b", component: "X", children: { id: "c", component: "Y" } }],
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("children")));
});

test("validate: rejects a nested block missing a component", () => {
  const res = validatePageInput({
    slug: "x",
    blocks: [{ id: "b", component: "X", children: [{ id: "c" }] }],
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("children[0].component")));
});

test("validate: rejects a non-string meta value", () => {
  const res = validatePageInput({
    slug: "x",
    blocks: [{ id: "b", component: "X" }],
    metaTitle: { en: 42 },
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("metaTitle")));
});

test("validate: defaults missing meta to empty maps", () => {
  const res = validatePageInput({ slug: "x", blocks: [{ id: "b", component: "X" }] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.page.metaTitle, {});
  assert.deepEqual(res.page.metaDescription, {});
});

test("validate: rejects bad JSON-string blocks", () => {
  const res = validatePageInput({ slug: "x", blocks: "{not json" });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("blocks")));
});

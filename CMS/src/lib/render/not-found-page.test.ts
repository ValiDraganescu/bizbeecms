import { test } from "node:test";
import assert from "node:assert/strict";
import { notFoundPageOptions } from "./not-found-page.ts";

const base = {
  parentSlug: null,
  publishStatus: "published",
  metaTitle: {},
};

test("only published pages become options", () => {
  const opts = notFoundPageOptions([
    { ...base, id: "a", slug: "a", metaTitle: { en: "A" } },
    { ...base, id: "b", slug: "b", publishStatus: "draft", metaTitle: { en: "B" } },
  ]);
  assert.deepEqual(opts, [{ id: "a", label: "A" }]);
});

test("label prefers default-locale title", () => {
  const [opt] = notFoundPageOptions(
    [{ ...base, id: "a", slug: "a", metaTitle: { en: "Eng", fi: "Fin" } }],
    "fi",
  );
  assert.equal(opt.label, "Fin");
});

test("label falls back to any title, then to the path", () => {
  const opts = notFoundPageOptions(
    [
      { ...base, id: "a", slug: "a", metaTitle: { fi: "OnlyFi" } }, // no en
      { ...base, id: "b", slug: "child", parentSlug: "parent", metaTitle: {} },
    ],
    "en",
  );
  assert.equal(opts[0].label, "OnlyFi");
  assert.equal(opts[1].label, "/parent/child");
});

test("whitespace-only title is treated as empty", () => {
  const [opt] = notFoundPageOptions(
    [{ ...base, id: "a", slug: "home", metaTitle: { en: "   " } }],
    "en",
  );
  assert.equal(opt.label, "/home");
});

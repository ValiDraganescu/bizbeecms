/**
 * Pure arg validation for the generate_image tool (node --test; no @/ imports).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGenerateImage, MAX_GEN_PROMPT_CHARS } from "./generate-image-tool.ts";

test("validateGenerateImage requires a non-blank prompt", () => {
  assert.equal(validateGenerateImage({}).ok, false);
  assert.equal(validateGenerateImage({ prompt: "   " }).ok, false);
  assert.equal(validateGenerateImage(null).ok, false);
});

test("validateGenerateImage trims the prompt and normalizes tags", () => {
  const v = validateGenerateImage({ prompt: "  a sunset  ", tags: ["Hero", "hero", " team "] });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.prompt, "a sunset");
    // normalizeTags trims + dedupes case-insensitively, keeping first casing.
    assert.deepEqual(v.tags, ["Hero", "team"]);
  }
});

test("validateGenerateImage caps an overlong prompt", () => {
  const long = "x".repeat(MAX_GEN_PROMPT_CHARS + 500);
  const v = validateGenerateImage({ prompt: long });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.prompt.length, MAX_GEN_PROMPT_CHARS);
});

test("validateGenerateImage defaults missing tags to []", () => {
  const v = validateGenerateImage({ prompt: "a cat" });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.tags, []);
});

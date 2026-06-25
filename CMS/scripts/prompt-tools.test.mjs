/**
 * Pure tests for the system-prompt CRUD tool validators (the only logic worth
 * testing — the store is a thin Drizzle wrapper). Covers the update partial-patch
 * rules and id coercion; create delegates to the already-tested validatePromptInput.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCreatePrompt,
  validateUpdatePrompt,
  coercePromptId,
} from "../src/lib/chat/prompt-tools.ts";

test("create: requires label + prompt, trims them", () => {
  assert.deepEqual(validateCreatePrompt({ label: " A ", prompt: " hi " }), { label: "A", prompt: "hi" });
  assert.ok("error" in validateCreatePrompt({ label: "A" }));
  assert.ok("error" in validateCreatePrompt({ prompt: "hi" }));
  assert.ok("error" in validateCreatePrompt({ label: "  ", prompt: "hi" }));
});

test("update: id required", () => {
  assert.ok("error" in validateUpdatePrompt({ label: "x" }));
  assert.ok("error" in validateUpdatePrompt({ id: "  ", label: "x" }));
});

test("update: at least one of label/prompt must be present", () => {
  assert.ok("error" in validateUpdatePrompt({ id: "pv1" }));
});

test("update: partial patch — only the present fields are returned, trimmed", () => {
  assert.deepEqual(validateUpdatePrompt({ id: "pv1", label: " new " }), { id: "pv1", label: "new" });
  assert.deepEqual(validateUpdatePrompt({ id: "pv1", prompt: " body " }), { id: "pv1", prompt: "body" });
  assert.deepEqual(validateUpdatePrompt({ id: "pv1", label: "L", prompt: "P" }), { id: "pv1", label: "L", prompt: "P" });
});

test("update: a present-but-empty field is an error (not 'leave unchanged')", () => {
  assert.ok("error" in validateUpdatePrompt({ id: "pv1", label: "   " }));
  assert.ok("error" in validateUpdatePrompt({ id: "pv1", prompt: "" }));
});

test("update: oversized fields rejected", () => {
  assert.ok("error" in validateUpdatePrompt({ id: "pv1", label: "x".repeat(81) }));
  assert.ok("error" in validateUpdatePrompt({ id: "pv1", prompt: "x".repeat(20001) }));
});

test("coercePromptId: trims, rejects blank/missing/non-object", () => {
  assert.equal(coercePromptId({ id: " pv1 " }), "pv1");
  assert.equal(coercePromptId({ id: "" }), null);
  assert.equal(coercePromptId({}), null);
  assert.equal(coercePromptId(null), null);
});

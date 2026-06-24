import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePromptInput,
  effectiveSystemPrompt,
  MAX_LABEL_LEN,
  MAX_PROMPT_LEN,
} from "./prompt-version.ts";

test("validatePromptInput accepts + trims", () => {
  const r = validatePromptInput({ label: "  v1 ", prompt: "  do things  " });
  assert.deepEqual(r, { label: "v1", prompt: "do things" });
});

test("validatePromptInput rejects non-object / missing fields", () => {
  assert.ok("error" in validatePromptInput(null));
  assert.ok("error" in validatePromptInput("x"));
  assert.ok("error" in validatePromptInput({ prompt: "p" }));
  assert.ok("error" in validatePromptInput({ label: "l" }));
});

test("validatePromptInput rejects empty-after-trim", () => {
  assert.ok("error" in validatePromptInput({ label: "   ", prompt: "p" }));
  assert.ok("error" in validatePromptInput({ label: "l", prompt: "   " }));
});

test("validatePromptInput rejects over-length", () => {
  assert.ok("error" in validatePromptInput({ label: "a".repeat(MAX_LABEL_LEN + 1), prompt: "p" }));
  assert.ok("error" in validatePromptInput({ label: "l", prompt: "a".repeat(MAX_PROMPT_LEN + 1) }));
});

test("effectiveSystemPrompt: override wins only when PM-SSO + non-empty", () => {
  assert.equal(
    effectiveSystemPrompt({ override: "OVERRIDE", isPmSso: true, assembled: "DEFAULT" }),
    "OVERRIDE",
  );
});

test("effectiveSystemPrompt: non-SSO caller's override is IGNORED", () => {
  assert.equal(
    effectiveSystemPrompt({ override: "OVERRIDE", isPmSso: false, assembled: "DEFAULT" }),
    "DEFAULT",
  );
});

test("effectiveSystemPrompt: empty/absent/non-string override → assembled", () => {
  assert.equal(effectiveSystemPrompt({ override: "  ", isPmSso: true, assembled: "D" }), "D");
  assert.equal(effectiveSystemPrompt({ override: undefined, isPmSso: true, assembled: "D" }), "D");
  assert.equal(effectiveSystemPrompt({ override: 42, isPmSso: true, assembled: "D" }), "D");
});

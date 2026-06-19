/**
 * Pure unit tests for AI-assistant conversation history helpers (ai-assistant
 * goal, Slice 4 sub-slice 3). The save body is UNTRUSTED — validateThreadInput
 * must drop malformed messages, bound sizes, derive a title, and never throw.
 *
 * Run: node --test scripts/history.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveTitle,
  validateThreadInput,
  parseStoredMessages,
  newThreadId,
} from "../src/lib/chat/history.ts";

test("deriveTitle uses the first user message, one-lined", () => {
  assert.equal(
    deriveTitle([
      { role: "assistant", content: "hi" },
      { role: "user", content: "  Build a\npricing\tcard " },
    ]),
    "Build a pricing card",
  );
});

test("deriveTitle truncates long input and falls back when no user msg", () => {
  const long = "x".repeat(200);
  const title = deriveTitle([{ role: "user", content: long }]);
  assert.ok(title.length <= 80);
  assert.ok(title.endsWith("…"));
  assert.equal(deriveTitle([{ role: "assistant", content: "only me" }]), "Conversation");
});

test("validateThreadInput rejects non-objects and empty/garbage message arrays", () => {
  assert.equal(validateThreadInput(null).ok, false);
  assert.equal(validateThreadInput("nope").ok, false);
  assert.equal(validateThreadInput({}).ok, false);
  assert.equal(validateThreadInput({ messages: [] }).ok, false);
  assert.equal(validateThreadInput({ messages: [{ role: "ufo", content: "x" }] }).ok, false);
});

test("validateThreadInput keeps valid messages, drops bad ones, derives title, nulls a bad id", () => {
  const res = validateThreadInput({
    messages: [
      { role: "user", content: "make a hero" },
      { role: "bogus", content: "skip" },
      { role: "assistant", content: 42 }, // non-string → dropped
      { role: "assistant", content: "done" },
    ],
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.input.messages, [
    { role: "user", content: "make a hero" },
    { role: "assistant", content: "done" },
  ]);
  assert.equal(res.input.title, "make a hero");
  assert.equal(res.input.id, null);
});

test("validateThreadInput trusts a supplied id (bounded) and explicit title", () => {
  const res = validateThreadInput({
    id: "th_abc",
    title: "Custom",
    messages: [{ role: "user", content: "x" }],
  });
  assert.equal(res.ok, true);
  assert.equal(res.input.id, "th_abc");
  assert.equal(res.input.title, "Custom");
});

test("parseStoredMessages is defensive against bad JSON / shapes", () => {
  assert.deepEqual(parseStoredMessages(""), []);
  assert.deepEqual(parseStoredMessages("not json"), []);
  assert.deepEqual(parseStoredMessages('{"not":"array"}'), []);
  assert.deepEqual(
    parseStoredMessages('[{"role":"user","content":"hi"},{"role":"x","content":"y"},{"role":"assistant","content":"ok"}]'),
    [
      { role: "user", content: "hi" },
      { role: "assistant", content: "ok" },
    ],
  );
});

test("newThreadId is non-empty and unique-ish", () => {
  const a = newThreadId();
  const b = newThreadId();
  assert.ok(a.startsWith("th_"));
  assert.notEqual(a, b);
});

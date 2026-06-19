/**
 * Pure unit tests for the AI model allowlist (ai-assistant goal, Slice 4
 * sub-slice 2 — model picker). The route's `model` field is UNTRUSTED, so
 * `resolveModel` must accept only allowlisted ids and fall back to the default
 * for everything else — never throw, never forward arbitrary strings.
 *
 * Run: node --test scripts/models.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_MODELS,
  DEFAULT_MODEL,
  isKnownModel,
  resolveModel,
} from "../src/lib/chat/models.ts";

test("DEFAULT_MODEL is itself an allowlisted id", () => {
  assert.ok(CHAT_MODELS.some((m) => m.id === DEFAULT_MODEL));
});

test("CHAT_MODELS ids are unique and non-empty", () => {
  const ids = CHAT_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of CHAT_MODELS) {
    assert.equal(typeof m.id, "string");
    assert.ok(m.id.length > 0);
    assert.ok(m.label.length > 0);
  }
});

test("isKnownModel accepts allowlisted ids only", () => {
  for (const m of CHAT_MODELS) assert.equal(isKnownModel(m.id), true);
  assert.equal(isKnownModel("@cf/totally/made-up"), false);
  assert.equal(isKnownModel(""), false);
  assert.equal(isKnownModel(42), false);
  assert.equal(isKnownModel(undefined), false);
  assert.equal(isKnownModel(null), false);
});

test("resolveModel returns allowlisted value, else the default", () => {
  const other = CHAT_MODELS.find((m) => m.id !== DEFAULT_MODEL);
  if (other) assert.equal(resolveModel(other.id), other.id);
  // untrusted / unknown → default (never a throw, never the raw string)
  assert.equal(resolveModel("'; DROP TABLE pages; --"), DEFAULT_MODEL);
  assert.equal(resolveModel("@cf/not/real"), DEFAULT_MODEL);
  assert.equal(resolveModel(undefined), DEFAULT_MODEL);
  assert.equal(resolveModel(null), DEFAULT_MODEL);
  assert.equal(resolveModel(123), DEFAULT_MODEL);
  assert.equal(resolveModel({}), DEFAULT_MODEL);
});

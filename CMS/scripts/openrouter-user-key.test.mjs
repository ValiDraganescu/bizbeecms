/**
 * Unit test for the CMS-local OpenRouter user-key PURE helpers
 * (`lib/settings/openrouter-key.ts`): validation (sk-or- prefix + bounds),
 * normalize (defensive), status projection, and the request-time precedence rule
 * (CMS-local user key wins over env key). The store
 * (`db/openrouter-key-store.ts`) is thin drizzle I/O and is not unit-tested.
 *
 * dep-free node --test over real `.ts` via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isValidUserKey,
  normalizeOpenrouterUserKey,
  toOpenrouterUserKeyStatus,
  effectiveOpenrouterKey,
  emptyOpenrouterUserKey,
} from "../src/lib/settings/openrouter-key.ts";

// A 32-byte base64 KEK for secret-box (any constant works for the test).
const KEK = Buffer.alloc(32, 7).toString("base64");

// ── Part 1: pure helpers ──────────────────────────────────────────────────

test("isValidUserKey requires a bounded sk-or- string", () => {
  assert.equal(isValidUserKey("sk-or-v1-abc"), true);
  assert.equal(isValidUserKey("  sk-or-v1-abc  "), true, "trims before check");
  assert.equal(isValidUserKey("sk-abc"), false, "wrong prefix");
  assert.equal(isValidUserKey(""), false);
  assert.equal(isValidUserKey("   "), false);
  assert.equal(isValidUserKey("sk-or-" + "x".repeat(300)), false, "too long");
  assert.equal(isValidUserKey(123), false);
  assert.equal(isValidUserKey(null), false);
});

test("normalizeOpenrouterUserKey keeps the blob verbatim, defends bad input", () => {
  assert.deepEqual(normalizeOpenrouterUserKey({ keyEnc: "abc" }), { keyEnc: "abc" });
  assert.deepEqual(normalizeOpenrouterUserKey({}), emptyOpenrouterUserKey());
  assert.deepEqual(normalizeOpenrouterUserKey(null), emptyOpenrouterUserKey());
  assert.deepEqual(normalizeOpenrouterUserKey({ keyEnc: 5 }), emptyOpenrouterUserKey());
});

test("toOpenrouterUserKeyStatus never echoes the key, only hasKey", () => {
  assert.deepEqual(toOpenrouterUserKeyStatus({ keyEnc: "blob" }), { hasKey: true });
  assert.deepEqual(toOpenrouterUserKeyStatus({ keyEnc: "" }), { hasKey: false });
});

test("effectiveOpenrouterKey prefers the user key, falls back to env", () => {
  assert.equal(effectiveOpenrouterKey("sk-or-user", "sk-or-env"), "sk-or-user");
  assert.equal(effectiveOpenrouterKey("  sk-or-user  ", "sk-or-env"), "sk-or-user", "trims");
  assert.equal(effectiveOpenrouterKey("", "sk-or-env"), "sk-or-env", "empty user → env");
  assert.equal(effectiveOpenrouterKey("   ", "sk-or-env"), "sk-or-env", "blank user → env");
  assert.equal(effectiveOpenrouterKey(null, "sk-or-env"), "sk-or-env");
  assert.equal(effectiveOpenrouterKey(undefined, undefined), "", "neither → empty");
  assert.equal(effectiveOpenrouterKey(null, "  "), "", "blank env → empty");
});
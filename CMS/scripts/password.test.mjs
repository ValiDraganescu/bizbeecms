/**
 * Dep-free unit tests for the PURE password primitives (cms-auth Slice 1).
 * Run: node --test scripts/password.test.mjs
 *
 * The user/session STORES are CF-coupled (import the Db port / next/headers) so
 * they're not node-loadable; the PBKDF2 hashing is pure and lives in
 * lib/auth/password.ts. Project convention: import the .ts directly via Node
 * type-stripping (no @/).
 *
 * GUARD against the live-only crypto-cap surprise (memory
 * pm-workers-pbkdf2-100k-cap): we assert the stored hash records exactly 100000
 * iterations, so a future bump above the Workers ceiling fails HERE in CI
 * instead of at runtime on a deployed Worker.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  isPasswordLongEnough,
  MIN_PASSWORD_LENGTH,
} from "../src/lib/auth/password.ts";

test("hashPassword: self-describing pbkdf2$<iters>$<salt>$<hash> at 100k", async () => {
  const stored = await hashPassword("correct horse battery staple");
  const parts = stored.split("$");
  assert.equal(parts.length, 4);
  assert.equal(parts[0], "pbkdf2");
  // CRITICAL: pinned at the Workers PBKDF2 ceiling — above 100k throws at
  // RUNTIME on Workers (build/tsc won't catch it). Keep this assertion.
  assert.equal(parts[1], "100000", "iterations must stay at the Workers 100k cap");
  assert.ok(parts[2].length > 0 && parts[3].length > 0, "salt + hash present");
});

test("hashPassword: random salt → two hashes of the same password differ", async () => {
  const a = await hashPassword("hunter2hunter2");
  const b = await hashPassword("hunter2hunter2");
  assert.notEqual(a, b, "per-call random salt must make hashes differ");
});

test("verifyPassword: round-trip — matches only the right password", async () => {
  const stored = await hashPassword("s3cret-passphrase");
  assert.equal(await verifyPassword("s3cret-passphrase", stored), true);
  assert.equal(await verifyPassword("wrong-passphrase", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("verifyPassword: false on malformed / foreign hash strings", async () => {
  assert.equal(await verifyPassword("pw", "not-a-hash"), false);
  assert.equal(await verifyPassword("pw", "pbkdf2$abc$salt$hash"), false, "non-numeric iters");
  assert.equal(await verifyPassword("pw", "bcrypt$10$x$y"), false, "foreign scheme");
  assert.equal(await verifyPassword("pw", ""), false);
});

test("isPasswordLongEnough: enforces the 10-char floor (mirrors PM)", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 10);
  assert.equal(isPasswordLongEnough("123456789"), false, "9 chars rejected");
  assert.equal(isPasswordLongEnough("1234567890"), true, "10 chars accepted");
  assert.equal(isPasswordLongEnough(""), false);
  assert.equal(isPasswordLongEnough(undefined), false);
});

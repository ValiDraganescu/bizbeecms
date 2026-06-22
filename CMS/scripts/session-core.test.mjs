/**
 * Dep-free unit tests for the PURE session primitives (cms-auth Slice 1).
 * Run: node --test scripts/session-core.test.mjs
 *
 * The session STORE is CF-coupled (D1 + next/headers cookies) so it's not
 * node-loadable; the id/record/expiry logic is pure (lib/auth/session-core.ts).
 * These cover create (buildSession) + read (isSessionValid) decisions without a
 * live D1 — the store just wires these to the table + cookie.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  newSessionId,
  buildSession,
  isSessionValid,
} from "../src/lib/auth/session-core.ts";

test("cookie name stays bizbee_session (Slice 0 decision) + 7-day TTL", () => {
  assert.equal(SESSION_COOKIE, "bizbee_session");
  assert.equal(SESSION_TTL_SECONDS, 60 * 60 * 24 * 7);
});

test("newSessionId: 64-hex (32 random bytes), unique per call", () => {
  const a = newSessionId();
  const b = newSessionId();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b, "two ids must differ");
});

test("buildSession: record carries id/userId and expiresAt = now + TTL", () => {
  const now = 1_000_000_000_000;
  const rec = buildSession("user-123", now, "fixed-id");
  assert.equal(rec.id, "fixed-id");
  assert.equal(rec.userId, "user-123");
  assert.equal(rec.createdAt, now);
  assert.equal(rec.expiresAt, now + SESSION_TTL_SECONDS * 1000);
});

test("buildSession: generates an id + uses Date.now when omitted", () => {
  const before = Date.now();
  const rec = buildSession("u");
  assert.match(rec.id, /^[0-9a-f]{64}$/);
  assert.ok(rec.createdAt >= before, "createdAt is roughly now");
  assert.ok(rec.expiresAt > rec.createdAt);
});

test("isSessionValid: live before expiry, dead at/after it", () => {
  const now = 2_000_000_000_000;
  const rec = buildSession("u", now, "id");
  assert.equal(isSessionValid(rec, now), true, "fresh session is valid");
  assert.equal(isSessionValid(rec, rec.expiresAt - 1), true, "just before expiry");
  assert.equal(isSessionValid(rec, rec.expiresAt), false, "exactly at expiry is dead");
  assert.equal(isSessionValid(rec, rec.expiresAt + 1000), false, "after expiry is dead");
});

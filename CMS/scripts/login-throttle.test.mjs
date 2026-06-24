/**
 * Tests for CMS-local login brute-force throttling PURE logic
 * (`lib/auth/throttle-core.ts`) — the sliding-window lockout decision. The store
 * (`db/login-attempt-store.ts`) is thin drizzle I/O and is not unit-tested.
 *
 * dep-free node --test; the real `.ts` modules import via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  decideThrottle,
  MAX_ATTEMPTS,
  WINDOW_MS,
} from "../src/lib/auth/throttle-core.ts";

// ---- PURE throttle-core ------------------------------------------------------

test("not locked below the limit", () => {
  const now = 1_000_000;
  const fails = Array.from({ length: MAX_ATTEMPTS - 1 }, () => now - 1000);
  assert.deepEqual(decideThrottle(fails, now), { locked: false });
});

test("locked at the limit, retry-after is until the oldest ages out", () => {
  const now = 10_000_000;
  // MAX_ATTEMPTS failures, oldest 60s ago.
  const oldest = now - 60_000;
  const fails = [oldest, ...Array.from({ length: MAX_ATTEMPTS - 1 }, () => now - 1000)];
  const d = decideThrottle(fails, now);
  assert.equal(d.locked, true);
  assert.equal(d.retryAfterMs, oldest + WINDOW_MS - now);
});

test("failures outside the window don't count", () => {
  const now = 10_000_000;
  // All MAX_ATTEMPTS are older than the window → not locked.
  const fails = Array.from({ length: MAX_ATTEMPTS + 2 }, () => now - WINDOW_MS - 1);
  assert.deepEqual(decideThrottle(fails, now), { locked: false });
});

test("empty history is never locked", () => {
  assert.deepEqual(decideThrottle([], 1), { locked: false });
});
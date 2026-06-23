import test from "node:test";
import assert from "node:assert/strict";
import { classifyReset } from "./reset-logic.ts";

/**
 * auth-reset P5: BEHAVIORAL pure-logic tests for reset-token classification.
 *
 * Unlike the source-text regressions in reset-route.test.ts, these execute the
 * real shipped `classifyReset` (which `checkReset` delegates to) and assert the
 * actual decisions: validity, the expiry boundary (just-expired vs just-valid),
 * and single-use (a used token is rejected even before expiry). No DB, no
 * frameworks — `classifyReset(row, now)` is pure.
 */

const NOW = 1_000_000_000_000; // fixed clock so the boundary is deterministic
const row = (over: Partial<{ usedAt: Date | null; expiresAt: Date }>) => ({
  usedAt: null,
  expiresAt: new Date(NOW + 60_000),
  ...over,
});

test("a fresh, unexpired, unused token is valid", () => {
  assert.equal(classifyReset(row({}), NOW), "valid");
});

test("a missing token is notFound", () => {
  assert.equal(classifyReset(null, NOW), "notFound");
  assert.equal(classifyReset(undefined, NOW), "notFound");
});

test("expiry boundary: one ms before expiry is valid, AT expiry is expired", () => {
  // just-valid: expiry is one tick in the future
  assert.equal(
    classifyReset(row({ expiresAt: new Date(NOW + 1) }), NOW),
    "valid",
  );
  // boundary: expiresAt === now must be rejected (<= now, not < now)
  assert.equal(
    classifyReset(row({ expiresAt: new Date(NOW) }), NOW),
    "expired",
  );
  // just-expired: one tick in the past
  assert.equal(
    classifyReset(row({ expiresAt: new Date(NOW - 1) }), NOW),
    "expired",
  );
});

test("single-use: a token with usedAt set is rejected (second use)", () => {
  // Simulates the row state AFTER a successful first reset stamped usedAt.
  const used = row({ usedAt: new Date(NOW - 1000) });
  assert.equal(classifyReset(used, NOW), "used");
  // "used" wins over "expired": a spent token reports used even if also expired.
  const usedAndExpired = row({
    usedAt: new Date(NOW - 1000),
    expiresAt: new Date(NOW - 500),
  });
  assert.equal(classifyReset(usedAndExpired, NOW), "used");
});

test("classifyReset defaults now to Date.now() when omitted", () => {
  // Far-future expiry is valid against the real clock; far-past is expired.
  assert.equal(
    classifyReset({ usedAt: null, expiresAt: new Date(Date.now() + 1e9) }),
    "valid",
  );
  assert.equal(
    classifyReset({ usedAt: null, expiresAt: new Date(Date.now() - 1e9) }),
    "expired",
  );
});

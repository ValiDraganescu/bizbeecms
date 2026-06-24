/**
 * Tests for the CMS invite flow PURE logic (`lib/invite/invite-core.ts`):
 * token format, TTL, status classifier. The store layer (`db/invite-store.ts`)
 * is thin drizzle I/O and is intentionally NOT unit-tested.
 *
 * dep-free node --test; the real `.ts` modules import via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyInvite,
  newInviteToken,
  buildInviteTimes,
  INVITE_TTL_MS,
} from "../src/lib/invite/invite-core.ts";

test("newInviteToken is 64 lowercase hex chars and unique", () => {
  const a = newInviteToken();
  const b = newInviteToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("buildInviteTimes sets a 7-day TTL from now", () => {
  const now = 1_000_000;
  const { createdAt, expiresAt } = buildInviteTimes(now);
  assert.equal(createdAt, now);
  assert.equal(expiresAt, now + INVITE_TTL_MS);
  assert.equal(INVITE_TTL_MS, 7 * 24 * 60 * 60 * 1000);
});

test("classifyInvite covers notFound / valid / expired / accepted", () => {
  const now = 1_000_000;
  const base = { email: "a@b.c", role: "Editor", acceptedAt: null, expiresAt: now + 1000 };
  assert.equal(classifyInvite(null, now), "notFound");
  assert.equal(classifyInvite(base, now), "valid");
  assert.equal(classifyInvite({ ...base, expiresAt: now - 1 }, now), "expired");
  assert.equal(classifyInvite({ ...base, expiresAt: now }, now), "expired"); // boundary: <=
  assert.equal(classifyInvite({ ...base, acceptedAt: 5 }, now), "accepted");
  // accepted wins over expired (a used invite is "accepted", not "expired").
  assert.equal(
    classifyInvite({ ...base, acceptedAt: 5, expiresAt: now - 1 }, now),
    "accepted",
  );
});

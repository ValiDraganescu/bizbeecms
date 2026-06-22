/**
 * Tests for the CMS invite flow (cms-auth Slice 4):
 *   - PURE: `lib/invite/invite-core.ts` — token format, TTL, status classifier.
 *   - STORE: `db/invite-store.ts` create → accept lifecycle + the rejection
 *     paths (expired, already-accepted, unknown token, email already a user),
 *     driven against a real `cfDb` over in-memory node:sqlite (the same fake-D1
 *     shim the asset/page-store tests use). So the REAL store logic runs with no
 *     Workers runtime, no live D1.
 *
 * dep-free node --test; the real `.ts` modules import via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  classifyInvite,
  newInviteToken,
  buildInviteTimes,
  INVITE_TTL_MS,
} from "../src/lib/invite/invite-core.ts";
import {
  createInvite,
  checkInvite,
  acceptInvite,
  hasPendingInvite,
  findInviteByToken,
} from "../src/db/invite-store.ts";
import { findUserByEmail, createUser } from "../src/db/user-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";

// ---- PURE invite-core --------------------------------------------------------

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

// ---- STORE lifecycle ---------------------------------------------------------

// Real DDL for the tables the store touches (from migrations 0009 user/session,
// 0011 invite). Dep-free; if the schema changes, the store queries change and
// these catch it.
const DDL = `
CREATE TABLE user (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL,
  password_hash text,
  role text DEFAULT 'Editor' NOT NULL,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX user_email_unique ON user (email);
CREATE TABLE invite (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'Editor' NOT NULL,
  invited_by text NOT NULL,
  token text NOT NULL,
  accepted_at integer,
  expires_at integer NOT NULL,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX invite_token_unique ON invite (token);
CREATE INDEX invite_email_idx ON invite (email);
`;

/** D1Database-shaped binding over in-memory node:sqlite. */
function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(DDL);
  return {
    sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const wrap = (params) => ({
        run: async () => {
          const r = stmt.run(...params);
          return { success: true, meta: { changes: r.changes }, results: [] };
        },
        all: async () => ({ success: true, results: stmt.all(...params) }),
        raw: async () => {
          const cols = stmt.columns().map((c) => c.name);
          return stmt.all(...params).map((row) => cols.map((c) => row[c]));
        },
        first: async () => stmt.get(...params) ?? null,
      });
      return { bind: (...params) => wrap(params), ...wrap([]) };
    },
  };
}

test("createInvite → accept happy path: user created with invited role, invite consumed", async () => {
  const db = cfDb(fakeD1());

  const invite = await createInvite(
    { email: "New.User@Example.com", role: "Manager", invitedBy: "inviter-1" },
    db,
  );
  // Email normalised, token present.
  assert.equal(invite.email, "new.user@example.com");
  assert.match(invite.token, /^[0-9a-f]{64}$/);
  assert.equal(invite.role, "Manager");

  // A pending invite is reported (case-insensitive).
  assert.equal(await hasPendingInvite("new.user@example.com", db), true);

  // checkInvite says valid.
  const { status } = await checkInvite(invite.token, db);
  assert.equal(status, "valid");

  // Accept creates the user with the invited role + the supplied hash.
  const result = await acceptInvite(invite.token, "hash:secret", db);
  assert.equal(result.ok, true);
  assert.equal(result.user.email, "new.user@example.com");
  assert.equal(result.user.role, "Manager");
  assert.equal(result.user.passwordHash, "hash:secret");

  // The user really exists now.
  const stored = await findUserByEmail("new.user@example.com", db);
  assert.ok(stored);
  assert.equal(stored.role, "Manager");

  // Invite is consumed: no longer pending, status now "accepted".
  assert.equal(await hasPendingInvite("new.user@example.com", db), false);
  assert.equal((await checkInvite(invite.token, db)).status, "accepted");
});

test("acceptInvite rejects an already-accepted token (no second user)", async () => {
  const db = cfDb(fakeD1());
  const invite = await createInvite(
    { email: "once@example.com", role: "Editor", invitedBy: "x" },
    db,
  );
  assert.equal((await acceptInvite(invite.token, "h1", db)).ok, true);

  const second = await acceptInvite(invite.token, "h2", db);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "accepted");
});

test("acceptInvite rejects an expired token", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);
  // Insert an already-expired invite directly.
  d1.sqlite
    .prepare(
      "INSERT INTO invite (id, email, role, invited_by, token, expires_at, created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run("i1", "old@example.com", "Editor", "x", "deadbeef", Date.now() - 1000, Date.now() - 2000);

  const r = await acceptInvite("deadbeef", "h", db);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "expired");
  // No user created.
  assert.equal(await findUserByEmail("old@example.com", db), null);
});

test("acceptInvite rejects an unknown token", async () => {
  const db = cfDb(fakeD1());
  const r = await acceptInvite("nope", "h", db);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "notFound");
});

test("acceptInvite rejects when a user already exists for the email", async () => {
  const db = cfDb(fakeD1());
  await createUser({ email: "taken@example.com", passwordHash: "x", role: "Editor" }, db);
  const invite = await createInvite(
    { email: "taken@example.com", role: "Admin", invitedBy: "x" },
    db,
  );
  const r = await acceptInvite(invite.token, "h", db);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "emailTaken");
});

test("findInviteByToken returns null for an absent token", async () => {
  const db = cfDb(fakeD1());
  assert.equal(await findInviteByToken("missing", db), null);
});

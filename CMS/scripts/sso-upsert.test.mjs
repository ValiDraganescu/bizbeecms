/**
 * Tests for the SSO operator upsert (cms-auth Slice-2 @pm.sso follow-up).
 * `upsertSsoUser(pmUserId, realEmail?)` keys the CMS row on the real verified PM
 * email (now returned by cms-validate), backfilling any earlier synthetic
 * `<pmUserId>@pm.sso` row, and falls back to the synthetic email when PM omits it.
 * Driven against in-memory node:sqlite via the injectedDb seam (same fake-D1 shim
 * the invite/user-mgmt store tests use) — real store logic, no Workers runtime.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  upsertSsoUser,
  ssoSyntheticEmail,
  findUserByEmail,
  listUsers,
  createUser,
} from "../src/db/user-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";

const DDL = `
CREATE TABLE user (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL,
  password_hash text,
  role text DEFAULT 'Editor' NOT NULL,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX user_email_unique ON user (email);
`;

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

test("ssoSyntheticEmail derives <pmUserId>@pm.sso", () => {
  assert.equal(ssoSyntheticEmail("abc-123"), "abc-123@pm.sso");
});

test("no real email → synthetic-keyed Admin user, idempotent on repeat", async () => {
  const db = cfDb(fakeD1());
  const a = await upsertSsoUser("pm-1", null, db);
  assert.equal(a.email, "pm-1@pm.sso");
  assert.equal(a.role, "Admin");
  assert.equal(a.passwordHash, null);
  const b = await upsertSsoUser("pm-1", undefined, db);
  assert.equal(b.id, a.id); // same row, not a duplicate
  assert.equal((await listUsers(db)).length, 1);
});

test("real email on first SSO login → row keyed on the real (normalised) email", async () => {
  const db = cfDb(fakeD1());
  const u = await upsertSsoUser("pm-2", "Op.Erator@Example.com", db);
  assert.equal(u.email, "op.erator@example.com");
  assert.equal(u.role, "Admin");
  assert.equal(await findUserByEmail("pm-2@pm.sso", db), null); // no synthetic row
  // Repeat login is idempotent.
  const again = await upsertSsoUser("pm-2", "op.erator@example.com", db);
  assert.equal(again.id, u.id);
  assert.equal((await listUsers(db)).length, 1);
});

test("backfill: a legacy synthetic row is renamed to the real email (no duplicate)", async () => {
  const db = cfDb(fakeD1());
  // Simulate the Slice-2 state: an SSO user keyed on the synthetic email.
  const legacy = await createUser(
    { email: ssoSyntheticEmail("pm-3"), passwordHash: null, role: "Admin" },
    db,
  );
  // Now PM returns the real email — the row is backfilled, same id.
  const u = await upsertSsoUser("pm-3", "real@example.com", db);
  assert.equal(u.id, legacy.id);
  assert.equal(u.email, "real@example.com");
  assert.equal((await listUsers(db)).length, 1);
  // The synthetic email no longer resolves; the real one does.
  assert.equal(await findUserByEmail(ssoSyntheticEmail("pm-3"), db), null);
  const byReal = await findUserByEmail("real@example.com", db);
  assert.equal(byReal.id, legacy.id);
  assert.equal(byReal.email, "real@example.com"); // persisted rename, not just the returned obj
});

test("real-email row already exists → reuse it, leave a stray synthetic row untouched", async () => {
  const db = cfDb(fakeD1());
  const real = await createUser(
    { email: "vip@example.com", passwordHash: null, role: "Admin" },
    db,
  );
  // A stray synthetic row also exists (e.g. created before the real one).
  await createUser({ email: ssoSyntheticEmail("pm-4"), passwordHash: null, role: "Admin" }, db);
  const u = await upsertSsoUser("pm-4", "vip@example.com", db);
  assert.equal(u.id, real.id); // reused the real-email row, no rename collision
  // ponytail: we don't merge/delete the stray synthetic row here — it's a benign
  // duplicate that the user-mgmt UI can remove; merging risks dropping the wrong row.
  assert.equal((await listUsers(db)).length, 2);
});

test("blank/whitespace email is treated as absent → synthetic fallback", async () => {
  const db = cfDb(fakeD1());
  const u = await upsertSsoUser("pm-5", "   ", db);
  assert.equal(u.email, "pm-5@pm.sso");
});

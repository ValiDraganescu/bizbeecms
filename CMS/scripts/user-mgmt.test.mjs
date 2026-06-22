/**
 * Tests for the CMS user-management slice (cms-auth Slice 5):
 *   - PURE: `lib/auth/user-mgmt.ts` — the per-row gating/view-model the UI and
 *     the /api/* layer both compute from (assignable roles, row controls).
 *   - STORE: `db/user-store.ts` (listUsers/updateUserRole/deleteUser — incl. the
 *     session sweep) + `db/invite-store.ts` deleteInvite, over the same in-memory
 *     node:sqlite fake-D1 the invite/asset tests use. Real store logic, no
 *     Workers runtime, no live D1.
 *
 * dep-free node --test; the real `.ts` modules import via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  ASSIGNABLE_ROLES,
  assignableRolesFor,
  userRowControls,
} from "../src/lib/auth/user-mgmt.ts";
import {
  listUsers,
  updateUserRole,
  deleteUser,
  createUser,
} from "../src/db/user-store.ts";
import { createInvite, deleteInvite, findInviteByToken } from "../src/db/invite-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";

// ---- PURE user-mgmt ----------------------------------------------------------

const admin = { id: "a", role: "Admin" };
const manager = { id: "m", role: "Manager" };
const editor = { id: "e", role: "Editor" };

test("ASSIGNABLE_ROLES excludes SuperAdmin, ordered high→low", () => {
  assert.deepEqual(ASSIGNABLE_ROLES, ["Admin", "Manager", "Editor"]);
});

test("assignableRolesFor: Admin can move a Manager to Editor (+current shown)", () => {
  const opts = assignableRolesFor(admin, manager);
  assert.ok(opts.includes("Manager")); // current stays visible
  assert.ok(opts.includes("Editor")); // can demote
  assert.ok(!opts.includes("Admin")); // can't grant own tier
});

test("assignableRolesFor: no options when actor can't touch target", () => {
  assert.deepEqual(assignableRolesFor(manager, admin), []); // below target tier
  assert.deepEqual(assignableRolesFor(admin, admin), []); // self
  assert.deepEqual(assignableRolesFor(editor, manager), []); // editor outranks no one
});

test("userRowControls: self row is locked", () => {
  const c = userRowControls(admin, { id: "a", role: "Admin" });
  assert.equal(c.isSelf, true);
  assert.equal(c.canRemove, false);
  assert.equal(c.canChangeRole, false);
});

test("userRowControls: Admin over Editor can change + remove", () => {
  const c = userRowControls(admin, { id: "x", role: "Editor" });
  assert.equal(c.canRemove, true);
  assert.equal(c.canChangeRole, true);
  assert.ok(c.roleOptions.includes("Manager"));
});

test("userRowControls: Manager can't touch an Admin", () => {
  const c = userRowControls(manager, { id: "x", role: "Admin" });
  assert.equal(c.canRemove, false);
  assert.equal(c.canChangeRole, false);
});

// ---- STORE -------------------------------------------------------------------

const DDL = `
CREATE TABLE user (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL,
  password_hash text,
  role text DEFAULT 'Editor' NOT NULL,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX user_email_unique ON user (email);
CREATE TABLE session (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
  expires_at integer NOT NULL
);
CREATE INDEX session_user_idx ON session (user_id);
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

test("listUsers returns all users, updateUserRole writes the new role", async () => {
  const db = cfDb(fakeD1());
  const u1 = await createUser({ email: "one@x.com", passwordHash: "h", role: "Editor" }, db);
  await createUser({ email: "two@x.com", passwordHash: null, role: "Manager" }, db);

  const all = await listUsers(db);
  assert.equal(all.length, 2);

  const updated = await updateUserRole(u1.id, "Manager", db);
  assert.equal(updated.role, "Manager");
});

test("updateUserRole returns null for an unknown id", async () => {
  const db = cfDb(fakeD1());
  assert.equal(await updateUserRole("nope", "Editor", db), null);
});

test("deleteUser removes the user AND their sessions; false for unknown id", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);
  const u = await createUser({ email: "del@x.com", passwordHash: "h", role: "Editor" }, db);
  // Seed a live session row for this user directly.
  d1.sqlite
    .prepare("INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)")
    .run("sess-1", u.id, Date.now() + 100000);

  assert.equal(await deleteUser(u.id, db), true);
  // User gone.
  assert.equal(
    d1.sqlite.prepare("SELECT COUNT(*) c FROM user WHERE id = ?").get(u.id).c,
    0,
  );
  // Session swept.
  assert.equal(
    d1.sqlite.prepare("SELECT COUNT(*) c FROM session WHERE user_id = ?").get(u.id).c,
    0,
  );
  // Unknown id → false, no throw.
  assert.equal(await deleteUser("ghost", db), false);
});

test("deleteInvite removes a pending invite; false for unknown id", async () => {
  const db = cfDb(fakeD1());
  const inv = await createInvite({ email: "p@x.com", role: "Editor", invitedBy: "a" }, db);
  assert.ok(await findInviteByToken(inv.token, db));

  assert.equal(await deleteInvite(inv.id, db), true);
  assert.equal(await findInviteByToken(inv.token, db), null);
  assert.equal(await deleteInvite("nope", db), false);
});

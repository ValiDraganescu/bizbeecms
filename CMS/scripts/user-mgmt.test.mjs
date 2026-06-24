/**
 * Tests for the CMS user-management PURE logic (`lib/auth/user-mgmt.ts`) — the
 * per-row gating/view-model the UI and the /api/* layer both compute from
 * (assignable roles, row controls). The store layer (`db/user-store.ts`,
 * `db/invite-store.ts`) is thin drizzle I/O and is intentionally NOT unit-tested.
 *
 * dep-free node --test; the real `.ts` modules import via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSIGNABLE_ROLES,
  assignableRolesFor,
  userRowControls,
} from "../src/lib/auth/user-mgmt.ts";

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

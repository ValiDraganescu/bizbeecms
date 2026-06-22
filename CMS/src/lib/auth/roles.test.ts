/**
 * cms-auth Slice 3 — role authorization tier rules. Pure, runs under
 * `node --test` (roles.ts type-only-imports CmsRole so it's runtime dep-free).
 * Mirrors PM's removal hierarchy with country/tag scope dropped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canInvite,
  canInviteRole,
  canManageUsers,
  canEditContent,
  canRemoveUser,
  canChangeRole,
  INVITABLE_ROLES,
} from "./roles.ts";

const A = (id: string, role: "SuperAdmin" | "Admin" | "Manager" | "Editor") => ({ id, role });

test("INVITABLE_ROLES excludes SuperAdmin", () => {
  assert.deepEqual(INVITABLE_ROLES, ["Admin", "Manager", "Editor"]);
});

test("canInvite: Manager and above only", () => {
  assert.equal(canInvite("SuperAdmin"), true);
  assert.equal(canInvite("Admin"), true);
  assert.equal(canInvite("Manager"), true);
  assert.equal(canInvite("Editor"), false);
});

test("canInviteRole: must outrank the granted role, never grants SuperAdmin", () => {
  assert.equal(canInviteRole("Admin", "Manager"), true);
  assert.equal(canInviteRole("Admin", "Editor"), true);
  assert.equal(canInviteRole("Admin", "Admin"), false); // not strictly below
  assert.equal(canInviteRole("Admin", "SuperAdmin"), false); // not invitable
  assert.equal(canInviteRole("Manager", "Editor"), true);
  assert.equal(canInviteRole("Manager", "Manager"), false);
  assert.equal(canInviteRole("Editor", "Editor"), false); // editors invite no one
});

test("canManageUsers: Manager and above", () => {
  assert.equal(canManageUsers("SuperAdmin"), true);
  assert.equal(canManageUsers("Admin"), true);
  assert.equal(canManageUsers("Manager"), true);
  assert.equal(canManageUsers("Editor"), false);
});

test("canEditContent: every CMS user can edit content", () => {
  for (const r of ["SuperAdmin", "Admin", "Manager", "Editor"] as const) {
    assert.equal(canEditContent(r), true);
  }
});

test("canRemoveUser: strictly-greater tier, no self-removal", () => {
  assert.equal(canRemoveUser(A("a", "SuperAdmin"), A("b", "Admin")), true);
  assert.equal(canRemoveUser(A("a", "Admin"), A("b", "SuperAdmin")), false);
  assert.equal(canRemoveUser(A("a", "Admin"), A("b", "Manager")), true);
  assert.equal(canRemoveUser(A("a", "Manager"), A("b", "Admin")), false);
  assert.equal(canRemoveUser(A("a", "Manager"), A("b", "Editor")), true);
  assert.equal(canRemoveUser(A("a", "Editor"), A("b", "Editor")), false); // peer
  assert.equal(canRemoveUser(A("a", "Admin"), A("b", "Admin")), false); // peer
  assert.equal(canRemoveUser(A("a", "Admin"), A("a", "Editor")), false); // self
});

test("canChangeRole: must outrank current AND destination tier, no self", () => {
  assert.equal(canChangeRole(A("a", "Admin"), A("b", "Editor"), "Manager"), true);
  assert.equal(canChangeRole(A("a", "Admin"), A("b", "Editor"), "Admin"), false); // dest = own tier
  assert.equal(canChangeRole(A("a", "Admin"), A("b", "Manager"), "Editor"), true);
  assert.equal(canChangeRole(A("a", "Manager"), A("b", "Admin"), "Editor"), false); // can't touch Admin
  assert.equal(canChangeRole(A("a", "Admin"), A("a", "Admin"), "Editor"), false); // self
});

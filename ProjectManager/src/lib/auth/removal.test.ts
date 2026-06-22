import { test } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "../../db/schema.ts";
import { canRemoveUser, canChangeRole, type RoleActor } from "./removal.ts";

const ROLES: Role[] = ["SuperAdmin", "Admin", "Manager", "Editor"];

const u = (role: Role, id = role): RoleActor => ({ id, role });

// Expected removal matrix [actor][target] — true = actor may remove target.
// SuperAdmin > Admin > Manager > Editor; strictly-greater rank removes.
const EXPECT: Record<Role, Record<Role, boolean>> = {
  SuperAdmin: { SuperAdmin: false, Admin: true, Manager: true, Editor: true },
  Admin: { SuperAdmin: false, Admin: false, Manager: true, Editor: true },
  Manager: { SuperAdmin: false, Admin: false, Manager: false, Editor: true },
  Editor: { SuperAdmin: false, Admin: false, Manager: false, Editor: false },
};

test("canRemoveUser: every (actor, target) tier pair", () => {
  for (const a of ROLES) {
    for (const t of ROLES) {
      // distinct ids so the self-check never interferes with the tier check
      const got = canRemoveUser(u(a, `${a}-1`), u(t, `${t}-2`));
      assert.equal(
        got,
        EXPECT[a][t],
        `${a} removing ${t} should be ${EXPECT[a][t]}, got ${got}`,
      );
    }
  }
});

test("canRemoveUser: no one can remove themselves (same id)", () => {
  for (const r of ROLES) {
    assert.equal(canRemoveUser(u(r, "me"), u(r, "me")), false, `${r} self-remove`);
  }
});

test("canRemoveUser: spec sentences", () => {
  assert.equal(canRemoveUser(u("Admin", "a"), u("SuperAdmin", "s")), false,
    "Admin cannot remove SuperAdmin");
  assert.equal(canRemoveUser(u("Manager", "m"), u("Admin", "a")), false,
    "Manager cannot remove Admin");
  assert.equal(canRemoveUser(u("Manager", "m"), u("SuperAdmin", "s")), false,
    "Manager cannot remove SuperAdmin");
  assert.equal(canRemoveUser(u("Editor", "e"), u("Editor", "e2")), false,
    "Editor removes no one");
  assert.equal(canRemoveUser(u("SuperAdmin", "s"), u("Admin", "a")), true,
    "SuperAdmin removes Admin");
});

test("canChangeRole: cannot re-role yourself", () => {
  assert.equal(canChangeRole(u("SuperAdmin", "me"), u("SuperAdmin", "me"), "Editor"), false);
});

test("canChangeRole: must outrank the target's CURRENT tier", () => {
  // Admin can't touch a SuperAdmin even to demote them.
  assert.equal(canChangeRole(u("Admin", "a"), u("SuperAdmin", "s"), "Editor"), false);
  // Manager can't re-role an Admin.
  assert.equal(canChangeRole(u("Manager", "m"), u("Admin", "a"), "Editor"), false);
});

test("canChangeRole: cannot elevate to or above your own tier", () => {
  // Admin may not promote a Manager to Admin (== own tier) or SuperAdmin (above).
  assert.equal(canChangeRole(u("Admin", "a"), u("Manager", "m"), "Admin"), false);
  assert.equal(canChangeRole(u("Admin", "a"), u("Manager", "m"), "SuperAdmin"), false);
  // …but may demote/keep below own tier.
  assert.equal(canChangeRole(u("Admin", "a"), u("Manager", "m"), "Editor"), true);
});

test("canChangeRole: SuperAdmin can grant any tier below SuperAdmin to a lower user", () => {
  assert.equal(canChangeRole(u("SuperAdmin", "s"), u("Editor", "e"), "Admin"), true);
  assert.equal(canChangeRole(u("SuperAdmin", "s"), u("Editor", "e"), "Manager"), true);
  // …but not to SuperAdmin (== own tier).
  assert.equal(canChangeRole(u("SuperAdmin", "s"), u("Editor", "e"), "SuperAdmin"), false);
});

test("canChangeRole: Editor can change no one's role", () => {
  for (const t of ROLES) {
    assert.equal(canChangeRole(u("Editor", "e"), u(t, `${t}-x`), "Editor"), false,
      `Editor re-roling ${t}`);
  }
});

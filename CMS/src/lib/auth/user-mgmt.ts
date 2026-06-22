/**
 * Pure view-model + gating helpers for the CMS user-management UI (cms-auth
 * Slice 5). Dependency-free (only a TYPE-ONLY `CmsRole` import, erased at
 * runtime) so a bare `node --test` can load it directly — same discipline as
 * `roles.ts` (the runner strips types but does NOT resolve the `@/` alias).
 *
 * These wrap the Slice-3 tier rules into the exact shapes the UI needs: which
 * roles a manager may assign, and whether a row's role/remove controls should be
 * enabled. The /api/* layer re-checks the SAME `canChangeRole`/`canRemoveUser`
 * (the real enforcement); this is the UI's defense-in-depth so it never offers a
 * control the server would 403.
 */
import type { CmsRole } from "../../db/schema.ts";
import {
  type RoleActor,
  canChangeRole,
  canRemoveUser,
} from "./roles.ts";

/** All assignable roles, highest-first (SuperAdmin is reserved/never assigned). */
export const ASSIGNABLE_ROLES: CmsRole[] = ["Admin", "Manager", "Editor"];

/**
 * The roles `actor` may set on `target` via the change-role control. A role is
 * offerable only when `canChangeRole(actor, target, role)` holds — strictly
 * below the actor's tier AND the actor outranks the target's current tier — PLUS
 * the target's CURRENT role (so the select always shows where it is, even if the
 * actor can't move it). Returns an empty list when the actor can't change this
 * target at all (self, or equal/higher tier).
 */
export function assignableRolesFor(
  actor: RoleActor,
  target: RoleActor,
): CmsRole[] {
  const options = ASSIGNABLE_ROLES.filter((r) =>
    canChangeRole(actor, target, r),
  );
  // Keep the current role visible in the dropdown even when locked.
  if (options.length > 0 && !options.includes(target.role)) {
    return [target.role, ...options];
  }
  return options;
}

/** Per-row UI capabilities for one target user, from the signed-in actor. */
export type UserRowControls = {
  /** Can the actor change this target's role (any move is possible)? */
  canChangeRole: boolean;
  /** Can the actor remove this target? */
  canRemove: boolean;
  /** This row is the actor themselves — controls are always disabled. */
  isSelf: boolean;
  /** Roles offerable in the change-role select (includes the current role). */
  roleOptions: CmsRole[];
};

/** Compute the row controls — the single source the UI renders from. */
export function userRowControls(
  actor: RoleActor,
  target: RoleActor,
): UserRowControls {
  const isSelf = actor.id === target.id;
  const roleOptions = assignableRolesFor(actor, target);
  return {
    isSelf,
    canRemove: canRemoveUser(actor, target),
    canChangeRole: roleOptions.length > 1 || (roleOptions.length === 1 && roleOptions[0] !== target.role),
    roleOptions,
  };
}

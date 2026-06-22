/**
 * CMS role authorization (cms-auth Slice 3) — ONE pure, dependency-free module
 * so a bare `node --test` can load it directly (the runner strips types but does
 * NOT resolve the `@/` alias, and a runtime `@/lib/...` import breaks a bare
 * test — see CAVEATS). `CmsRole` is a TYPE-ONLY import (erased at runtime), so
 * this module has NO runtime dependency on the Drizzle schema.
 *
 * Mirrors PM's role SET + removal hierarchy (`ProjectManager/src/lib/auth/
 * removal.ts`) VERBATIM in spirit, with PM's country/tag SCOPE DROPPED — a single
 * deployed CMS is ONE Site, so scope is meaningless here. The role tier rule is
 * the whole authorization story for the CMS.
 *
 * THE TIER RULE (USER DIRECTIVE 2026-06-21, same as PM):
 *   - SuperAdmin — everything.
 *   - Admin      — manage users/content + invite; can't touch a SuperAdmin.
 *   - Manager    — manage content + users below Admin; can't touch Admin/SuperAdmin.
 *   - Editor     — edit content only; invites/removes no one.
 *   - No one removes or re-roles THEMSELVES via these helpers.
 */

import type { CmsRole } from "../../db/schema.ts";

/** Minimal shape the tier rules need — id (self-check) + role. */
export type RoleActor = { id: string; role: CmsRole };

/** Tier rank: higher number = more power. Removal needs strictly-greater rank. */
const RANK: Record<CmsRole, number> = {
  SuperAdmin: 3,
  Admin: 2,
  Manager: 1,
  Editor: 0,
};

/** Roles that may be granted through an invite (SuperAdmin is never invitable). */
export const INVITABLE_ROLES: CmsRole[] = ["Admin", "Manager", "Editor"];

/**
 * Can this role send invites at all? Manager and above. WHICH roles a Manager may
 * grant is bounded by the same tier barrier as removal (a Manager can't invite an
 * Admin) — enforce that per-invite with `canInviteRole`, which `INVITABLE_ROLES`
 * filters against. Editors invite no one.
 */
export function canInvite(role: CmsRole): boolean {
  return RANK[role] >= RANK.Manager;
}

/**
 * Can an actor with `role` grant `targetRole` via invite? The role must be
 * invitable (never SuperAdmin) AND strictly below the actor's tier — so an Admin
 * can grant Manager/Editor, a Manager can grant Editor only.
 */
export function canInviteRole(role: CmsRole, targetRole: CmsRole): boolean {
  if (!canInvite(role)) return false;
  if (!INVITABLE_ROLES.includes(targetRole)) return false;
  return RANK[role] > RANK[targetRole];
}

/** Can this role open the user-management surface (list/invite/change/remove)? */
export function canManageUsers(role: CmsRole): boolean {
  return RANK[role] >= RANK.Manager;
}

/** Can this role create/edit content (pages, components, collections, settings)? */
export function canEditContent(role: CmsRole): boolean {
  return RANK[role] >= RANK.Editor; // every CMS user can edit content
}

/**
 * Can `actor` remove `target`? True only when the actor strictly outranks the
 * target AND they are different users. (Editor, the bottom tier, outranks no one,
 * so it can never remove anyone — falls out of the strict `>` automatically.)
 */
export function canRemoveUser(actor: RoleActor, target: RoleActor): boolean {
  if (actor.id === target.id) return false; // no self-removal
  return RANK[actor.role] > RANK[target.role];
}

/**
 * Can `actor` change `target`'s role to `newRole`? Same tier barrier as removal,
 * applied to BOTH the target's CURRENT tier and the DESTINATION tier: you may
 * never re-role someone you couldn't remove, and you may never grant a tier at or
 * above your own.
 */
export function canChangeRole(
  actor: RoleActor,
  target: RoleActor,
  newRole: CmsRole,
): boolean {
  if (actor.id === target.id) return false; // no re-roling yourself
  if (RANK[actor.role] <= RANK[target.role]) return false;
  if (RANK[actor.role] <= RANK[newRole]) return false;
  return true;
}

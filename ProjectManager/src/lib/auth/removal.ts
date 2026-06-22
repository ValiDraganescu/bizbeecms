/**
 * Removal hierarchy — the "who can remove / re-role whom" rule (pm-roles Slice 2).
 *
 * ONE pure, dependency-free helper so it's directly importable by `node --test`
 * (the test runner strips types but does NOT resolve the `@/` alias, and runtime
 * `@/lib/...` imports break a bare test — see CAVEATS). `Role` is a type-only
 * import (erased at runtime), so this module has NO runtime dependency on the
 * Drizzle schema. The CMS (`cms-auth`) mirrors this file verbatim.
 *
 * THE RULE (USER DIRECTIVE 2026-06-21):
 *   - SuperAdmin removes anyone.
 *   - Admin     removes anyone EXCEPT a SuperAdmin.
 *   - Manager   removes anyone EXCEPT a SuperAdmin or an Admin.
 *   - Editor    removes no one.
 *   - No one removes (or re-roles) THEMSELVES via this path.
 *
 * Scope (Manager country+tag reach) is NOT enforced here — that lands in Slice 3
 * once tags exist, and is an ADDITIONAL gate on top of this tier rule. This helper
 * answers only the tier question.
 */

import type { Role } from "../../db/schema.ts";

/** Minimal shape this rule needs — id (self-check) + role. */
export type RoleActor = { id: string; role: Role };

/** Tier rank: higher number = more power. Removal needs strictly-greater rank. */
const RANK: Record<Role, number> = {
  SuperAdmin: 3,
  Admin: 2,
  Manager: 1,
  Editor: 0,
};

/**
 * Can `actor` remove `target`? True only when the actor outranks the target
 * AND they are different users. (Editor, the bottom tier, outranks no one, so it
 * can never remove anyone — falls out of the strict `>` automatically.)
 */
export function canRemoveUser(actor: RoleActor, target: RoleActor): boolean {
  if (actor.id === target.id) return false; // no self-removal
  return RANK[actor.role] > RANK[target.role];
}

/**
 * Can `actor` change `target`'s role to `newRole`? Same tier barrier as removal,
 * applied to BOTH the target's CURRENT tier and the DESTINATION tier: you may
 * never re-role someone you couldn't remove, and you may never grant a tier at or
 * above your own (no self-promotion of others into your peerage). A no-op (newRole
 * unchanged) is allowed only when you already outrank the target.
 */
export function canChangeRole(
  actor: RoleActor,
  target: RoleActor,
  newRole: Role,
): boolean {
  if (actor.id === target.id) return false; // no re-roling yourself
  // Must outrank the target as they stand now…
  if (RANK[actor.role] <= RANK[target.role]) return false;
  // …and must outrank the destination tier (can't elevate to/above your own tier).
  if (RANK[actor.role] <= RANK[newRole]) return false;
  return true;
}

/**
 * Global user-management authz — the SCOPE-SUBSET rule for the
 * `PATCH /api/users/[id]` route (pm-roles Slice 4).
 *
 * PURE + alias-free so `node --test` can import it directly (the runner strips
 * types but does NOT resolve the `@/` alias; runtime `@/lib/...` imports break a
 * bare test — see CAVEATS). Only `import type` here.
 *
 * This is the SUBSET gate ONLY — "may the actor grant THESE countries/tags?".
 * The tier gate (`canChangeRole`/`canRemoveUser` in removal.ts) is a SEPARATE,
 * additional check the route also calls. Mirrors `authorizeInvite`'s country
 * subset logic, extended to tags:
 *   - SuperAdmin and global actors (own country scope empty) may grant ANY set,
 *     including the empty/global set.
 *   - A country/tag-scoped actor may grant only a NON-EMPTY subset of their OWN
 *     countries (no global) and only tags from their OWN tag set.
 *
 * "Scoped" is decided per-dimension: an actor with countries but no tags is
 * country-scoped (can't grant global countries) yet tag-unconstrained only if
 * they're global overall. We keep it simple and conservative: a non-SuperAdmin
 * whose country scope is non-empty is treated as scoped on BOTH dimensions.
 */

import type { Role } from "../../db/schema.ts";

export type AssignActor = {
  role: Role;
  /** Actor's own country scope. Empty = global (SuperAdmin or global Admin). */
  countries: readonly string[];
  /** Actor's own tag scope. */
  tagIds: readonly string[];
};

export type AssignAuthzError =
  | "countryNotAllowed" // a granted country is outside the actor's scope
  | "tagNotAllowed"; // a granted tag is outside the actor's scope

/** Is the actor unconstrained by scope (may grant anything, incl. global)? */
export function hasGlobalAssignScope(actor: AssignActor): boolean {
  return actor.role === "SuperAdmin" || actor.countries.length === 0;
}

/**
 * Validate that `actor` may assign exactly `countries` + `tagIds` to a target.
 * Returns the first error key, or null when allowed. Does NOT check the tier
 * rule — the route calls `canChangeRole` separately.
 */
export function authorizeAssign(
  actor: AssignActor,
  countries: readonly string[],
  tagIds: readonly string[],
): AssignAuthzError | null {
  // Global actors may grant any set, including the empty/global set.
  if (hasGlobalAssignScope(actor)) return null;

  // Scoped actor: must grant a non-empty subset of their own countries — no
  // global, no outside country (mirrors authorizeInvite).
  if (countries.length === 0) return "countryNotAllowed";
  const ownCountries = new Set(actor.countries);
  if (!countries.every((c) => ownCountries.has(c))) return "countryNotAllowed";

  // Tags: every granted tag must be one the actor itself holds.
  const ownTags = new Set(actor.tagIds);
  if (!tagIds.every((t) => ownTags.has(t))) return "tagNotAllowed";

  return null;
}

import type { Role, User } from "@/db/schema";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import { authorizeAssign } from "@/lib/auth/manage-users";

/**
 * Server-side authorization for inviting users. Enforced in the invite action —
 * never trust the client to have hidden disallowed options.
 *
 * Country scope is a SET of country codes; an empty set means GLOBAL (all
 * countries). Tags are an ADDITIONAL Manager-only scope dimension (pm-roles
 * Slice 6). Rules:
 *  - SuperAdmin may invite any invitable role, any country/tag set (incl. global).
 *  - A global Admin (own scope empty) with `canInvite` may invite Admin/Manager/
 *    Editor with any country/tag set, including global.
 *  - A country-scoped Admin with `canInvite` may invite the same roles, but the
 *    granted countries must be a NON-EMPTY SUBSET of the Admin's own countries
 *    and the granted tags a subset of the Admin's own tags (no global, nothing
 *    outside their scope). This reuses `authorizeAssign` — the same subset rule
 *    the user-management API + UI use, so invite and PATCH stay in lockstep.
 *  - Editors (and Admins without canInvite) may not invite at all.
 *  - No one can mint another SuperAdmin via invite (only the first registrant).
 */

/** Roles that can be granted through an invite (SuperAdmin is excluded). */
export const INVITABLE_ROLES: Role[] = ["Admin", "Manager", "Editor"];

export function canUserInvite(user: User): boolean {
  if (user.role === "SuperAdmin") return true;
  if (user.role === "Admin") return user.canInvite;
  return false;
}

export type InviteAuthzError =
  | "notAllowed" // the inviter may not invite at all
  | "roleNotAllowed" // SuperAdmin can't be granted; or role outside grant set
  | "countryNotAllowed" // inviter can't scope to (one of) these countries
  | "tagNotAllowed"; // inviter can't grant (one of) these tags

/**
 * Validate a proposed (role, countries, tags) against the inviter and the
 * inviter's own country + tag scope. `countries`/`tagIds` are the requested
 * sets (empty countries = global). The inviter's own scope is passed explicitly
 * since it lives in join tables.
 *
 * Returns an error key or null when allowed.
 */
export function authorizeInvite(
  inviter: User,
  inviterCountries: CountryCode[],
  role: Role,
  countries: CountryCode[],
  inviterTagIds: string[] = [],
  tagIds: string[] = [],
): InviteAuthzError | null {
  if (!canUserInvite(inviter)) return "notAllowed";

  // SuperAdmin is never grantable via invite.
  if (!INVITABLE_ROLES.includes(role)) return "roleNotAllowed";

  // Every requested code must be a known country.
  if (!countries.every((c) => isCountryCode(c))) return "countryNotAllowed";

  // Tags only matter for Manager invites; for any other role we don't grant any.
  const grantTags = role === "Manager" ? tagIds : [];

  // Reuse the user-management subset rule: global actor → anything; scoped actor
  // → non-empty country subset + tag subset. Same source of truth as PATCH.
  return authorizeAssign(
    { role: inviter.role, countries: inviterCountries, tagIds: inviterTagIds },
    countries,
    grantTags,
  );
}

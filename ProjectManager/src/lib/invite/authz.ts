import type { Role, User } from "@/db/schema";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";

/**
 * Server-side authorization for inviting users. Enforced in the invite action —
 * never trust the client to have hidden disallowed options.
 *
 * Country scope is a SET of country codes; an empty set means GLOBAL (all
 * countries). Rules:
 *  - SuperAdmin may invite any invitable role, any country set (incl. global).
 *  - A global Admin (own scope empty) with `canInvite` may invite Admin or
 *    SiteManager with any country set, including global.
 *  - A country-scoped Admin with `canInvite` may invite Admin or SiteManager,
 *    but the granted set must be a NON-EMPTY SUBSET of the Admin's own
 *    countries — they can't grant global, nor a country outside their scope.
 *  - SiteManagers (and Admins without canInvite) may not invite at all.
 *  - No one can mint another SuperAdmin via invite (only the first registrant).
 */

/** Roles that can be granted through an invite (SuperAdmin is excluded). */
export const INVITABLE_ROLES: Role[] = ["Admin", "SiteManager"];

export function canUserInvite(user: User): boolean {
  if (user.role === "SuperAdmin") return true;
  if (user.role === "Admin") return user.canInvite;
  return false;
}

export type InviteAuthzError =
  | "notAllowed" // the inviter may not invite at all
  | "roleNotAllowed" // SuperAdmin can't be granted; or role outside grant set
  | "countryNotAllowed"; // inviter can't scope to (one of) these countries

/**
 * Validate a proposed (role, countries) against the inviter and the inviter's
 * own country scope. `countries` is the requested set (empty = global). The
 * inviter's own scope is passed explicitly since it lives in a join table.
 *
 * Returns an error key or null when allowed.
 */
export function authorizeInvite(
  inviter: User,
  inviterCountries: CountryCode[],
  role: Role,
  countries: CountryCode[],
): InviteAuthzError | null {
  if (!canUserInvite(inviter)) return "notAllowed";

  // SuperAdmin is never grantable via invite.
  if (!INVITABLE_ROLES.includes(role)) return "roleNotAllowed";

  // Every requested code must be a known country.
  if (!countries.every((c) => isCountryCode(c))) return "countryNotAllowed";

  // SuperAdmin and global Admins (no own scope) may grant any set or global.
  if (inviter.role === "SuperAdmin" || inviterCountries.length === 0) {
    return null;
  }

  // Country-scoped Admin: must grant a non-empty subset of their own scope.
  if (countries.length === 0) return "countryNotAllowed"; // can't grant global
  const allowed = new Set(inviterCountries);
  if (!countries.every((c) => allowed.has(c))) return "countryNotAllowed";

  return null;
}

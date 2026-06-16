import type { Role, User } from "@/db/schema";
import { isCountryCode } from "@/lib/auth/countries";

/**
 * Server-side authorization rules for inviting users. Enforced in the invite
 * action — never trust the client to have hidden disallowed options.
 *
 * Rules:
 *  - SuperAdmin may invite any role (Admin, SiteManager) for any country, or
 *    global (null country).
 *  - An Admin with `canInvite` may invite Admin or SiteManager, but ONLY scoped
 *    to their own country (a country-scoped Admin can't grant global or another
 *    country; a global Admin — country null — may grant any country or global).
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
  | "roleNotAllowed" // SuperAdmin can't be granted; or role outside inviter's grant set
  | "countryNotAllowed"; // inviter can't scope to this country

/**
 * Validate a proposed (role, country) against the inviter. `country` is the
 * stored value: a CountryCode string or null (global). Returns an error key or
 * null when allowed.
 */
export function authorizeInvite(
  inviter: User,
  role: Role,
  country: string | null,
): InviteAuthzError | null {
  if (!canUserInvite(inviter)) return "notAllowed";

  // SuperAdmin is never grantable via invite.
  if (!INVITABLE_ROLES.includes(role)) return "roleNotAllowed";

  // Country must be a known code or global (null).
  if (country !== null && !isCountryCode(country)) return "countryNotAllowed";

  if (inviter.role === "SuperAdmin") {
    // Any invitable role, any country or global.
    return null;
  }

  // Admin with canInvite: a country-scoped Admin can only grant their own
  // country; a global Admin (country null) may grant any country or global.
  if (inviter.country !== null && country !== inviter.country) {
    return "countryNotAllowed";
  }

  return null;
}

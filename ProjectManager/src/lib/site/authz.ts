import type { Site, User } from "@/db/schema";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";

/**
 * Server-side authorization for Sites. Enforced in the site actions — never
 * trust the client to have hidden disallowed options or rows.
 *
 * A Site has a SINGLE country (or null = global), unlike users/invites whose
 * scope is a set. Rules mirror the invite subset logic:
 *  - SuperAdmin may do anything: create in any country (incl. global), see and
 *    edit every Site.
 *  - A global Admin (own scope empty) may create in any country (incl. global)
 *    and see/edit every Site.
 *  - A country-scoped Admin may create only a Site whose country is ONE of their
 *    own countries (never global, never an outside country), and may see/edit
 *    only Sites whose country is in their scope. Global Sites are NOT visible to
 *    a scoped Admin.
 *  - SiteManagers may not create or edit Sites; they only see Sites they're
 *    assigned to (handled in the data layer via site_users, not here).
 */

export function canUserCreateSite(user: User): boolean {
  return user.role === "SuperAdmin" || user.role === "Admin";
}

/** True when the user's own scope grants every country (SuperAdmin / global). */
export function hasGlobalScope(user: User, userCountries: CountryCode[]): boolean {
  return user.role === "SuperAdmin" || userCountries.length === 0;
}

export type SiteAuthzError =
  | "notAllowed" // the user may not create/edit Sites at all
  | "countryNotAllowed"; // user can't scope a Site to this country

/**
 * Validate a proposed Site country against the actor and their own scope.
 * `country` is the requested single value: a CountryCode, or null for global.
 * The actor's own scope is passed explicitly since it lives in a join table.
 *
 * Returns an error key, or null when allowed.
 */
export function authorizeSiteCountry(
  actor: User,
  actorCountries: CountryCode[],
  country: CountryCode | null,
): SiteAuthzError | null {
  if (!canUserCreateSite(actor)) return "notAllowed";

  // A concrete country must be a known code.
  if (country !== null && !isCountryCode(country)) return "countryNotAllowed";

  // SuperAdmin and global Admins may scope to any country or global.
  if (hasGlobalScope(actor, actorCountries)) return null;

  // Country-scoped Admin: must pick exactly one of their own countries — no
  // global, no outside country.
  if (country === null) return "countryNotAllowed";
  return actorCountries.includes(country) ? null : "countryNotAllowed";
}

/**
 * Whether `actor` may see/edit a Site by virtue of its country scope alone
 * (Admin reach). SuperAdmin and global Admins reach every Site; a scoped Admin
 * reaches only Sites whose country is in their scope (global Sites excluded).
 *
 * NOTE: SiteManagers reach Sites via assignment (site_users), which this does
 * NOT cover — the data layer unions assignment in for the list/detail.
 */
export function canManageSiteByCountry(
  actor: User,
  actorCountries: CountryCode[],
  site: Pick<Site, "country">,
): boolean {
  if (!canUserCreateSite(actor)) return false;
  if (hasGlobalScope(actor, actorCountries)) return true;
  if (site.country === null) return false; // global Site, scoped Admin
  return isCountryCode(site.country) && actorCountries.includes(site.country);
}

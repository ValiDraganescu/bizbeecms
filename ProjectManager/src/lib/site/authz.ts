import type { Site, User } from "@/db/schema";
import { isCountryCode, type CountryCode } from "@/lib/auth/countries";
import { canManageSite as canManageSiteScope } from "@/lib/site/scope";

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
 *  - Editors may not create or edit Sites; they only see Sites they're
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
 * Whether `actor` reaches a Site by SCOPE (pm-roles Slice 3). Delegates to the
 * pure, alias-free `canManageSite` rule (lib/site/scope.ts) — the single source
 * of truth — passing both scope dimensions:
 *  - SuperAdmin / global Admin → every Site.
 *  - country-scoped Admin → country match (tags ignored for Admin).
 *  - Manager → country match AND tag overlap (both required).
 *  - Editor → nothing here (reaches assigned Sites via site_users in the data
 *    layer, which this does NOT cover).
 *
 * `actorTagIds` / the Site's `tagIds` matter only for the Manager tier; Admin and
 * SuperAdmin callers may pass `[]` for both (kept for backward-compat). The old
 * name `canManageSiteByCountry` is retained as an alias so existing routes still
 * compile while Slice 4/5 migrate them to the tag-aware form.
 */
export function canManageSite(
  actor: User,
  actorCountries: CountryCode[],
  site: Pick<Site, "country"> & { tagIds?: string[] },
  actorTagIds: string[] = [],
): boolean {
  return canManageSiteScope(actor, actorCountries, actorTagIds, {
    country: isCountryCode(site.country) ? site.country : null,
    tagIds: site.tagIds ?? [],
  });
}

/** @deprecated Use `canManageSite`. Country-only alias for pre-Slice-3 callers. */
export const canManageSiteByCountry = canManageSite;

/**
 * Site-assignment candidacy rule (pm-roles — Editor follow-up).
 *
 * PURE + alias-free so `node --test` can import it directly (the runner strips
 * types but does NOT resolve the `@/` alias, and runtime `@/lib/...` imports break
 * a bare test — see CAVEATS). This is the candidacy predicate that `site.ts`'s
 * `listAssignableUsers` runs in memory after loading every user's country scope.
 *
 * "Who may be ASSIGNED to this Site?" is a COUNTRY-bounded question, distinct from
 * "who reaches it by scope" (scope.ts). Assignment is the explicit, per-Site grant
 * that gives Editors (and scoped Admins/Managers, as a union) their reach — so the
 * candidate pool is every role, bounded only by country so you never assign a
 * country-scoped user to a Site outside their country:
 *   - global user (no country rows: SuperAdmin, global Admin, AND every Editor —
 *     Editors carry no country/tag scope by construction) → fits ANY Site.
 *   - country-scoped user → fits only Sites whose country ∈ their scope.
 *   - a global Site (country === null) → accepts only globally-scoped users.
 *
 * Tags do NOT bound assignment candidacy: a Manager's tag reach is automatic
 * (listSitesForUser), and assignment is the country-only manual grant. Keeping
 * this country-only matches the existing behavior — it just makes it testable.
 */

/** True if `userCountries` (the user's country scope) may be assigned to a Site of `siteCountry`. */
export function isAssignableToSite(
  userCountries: readonly string[],
  siteCountry: string | null,
): boolean {
  if (userCountries.length === 0) return true; // global user fits any Site
  if (siteCountry === null) return false; // global Site needs a global user
  return userCountries.includes(siteCountry);
}

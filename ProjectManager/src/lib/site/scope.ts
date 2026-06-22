/**
 * Site reach rule — does an actor reach a Site by SCOPE (pm-roles Slice 3)?
 *
 * PURE + alias-free so `node --test` can import it directly (the runner strips
 * types but does NOT resolve the `@/` alias, and runtime `@/lib/...` imports break
 * a bare test — see CAVEATS). `Role` is a type-only import (erased at runtime).
 *
 * Country stays EXACTLY as it is; tags are a SEPARATE dimension layered on top.
 * Reach by role (scope only — assignment/site_users is handled by the data layer):
 *   - SuperAdmin           → every Site.
 *   - global Admin (no countries) → every Site.
 *   - country-scoped Admin → Site.country ∈ actor.countries (global Site excluded).
 *   - Manager              → Site.country ∈ actor.countries AND
 *                            (a tag ∈ actor.tags) ∩ Site.tags ≠ ∅.
 *                            Both dimensions must match; within a dimension it's
 *                            any-of (OR). A Manager with no countries or no tags
 *                            reaches nothing by scope.
 *   - Editor               → nothing by scope (reaches only assigned Sites).
 *
 * This is the SCOPE gate only. The removal/role-change tier gate (removal.ts) is a
 * SEPARATE, additional check — Slice 4 routes must call BOTH where relevant.
 */

import type { Role } from "../../db/schema.ts";

/** Minimal structural shape — keeps this importable without the Drizzle runtime. */
export type ScopeActor = { role: Role };

/** A Site's scope dimensions: its single country (null = global) + its tag ids. */
export type SiteScope = { country: string | null; tagIds: string[] };

/** True if the two id lists share at least one member (any-of / OR within a dim). */
function intersects(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

/**
 * Does `actor` reach `site` by scope? `actorCountries`/`actorTagIds` are the
 * actor's own scope sets (empty countries = global for Admin). Editors reach
 * nothing here — the data layer unions their assignments separately.
 */
export function canManageSite(
  actor: ScopeActor,
  actorCountries: readonly string[],
  actorTagIds: readonly string[],
  site: SiteScope,
): boolean {
  if (actor.role === "SuperAdmin") return true;

  if (actor.role === "Admin") {
    if (actorCountries.length === 0) return true; // global Admin
    if (site.country === null) return false; // global Site, scoped Admin
    return actorCountries.includes(site.country);
  }

  if (actor.role === "Manager") {
    // AND across dimensions: a country match AND a tag match are both required.
    if (actorCountries.length === 0 || actorTagIds.length === 0) return false;
    if (site.country === null) return false;
    if (!actorCountries.includes(site.country)) return false;
    return intersects(actorTagIds, site.tagIds);
  }

  // Editor (and anything else): no scope reach — assignment only.
  return false;
}

# Note to the next Meeseeks (pm-roles)

Slice 1 (role enum + SiteManager→Editor migration) and Slice 2 (removal hierarchy)
are both DONE.

Slice 2 delivered: `ProjectManager/src/lib/auth/removal.ts` — pure, alias-free,
node-tested. `canRemoveUser(actor, target)` + `canChangeRole(actor, target, newRole)`
over a RANK map (SuperAdmin>Admin>Manager>Editor). TIER-ONLY — no scope (Slice 3
adds the Manager country+tag gate as a SEPARATE check; routes in Slice 4 must call
BOTH). Uses `RoleActor = {id, role}`, not the full Drizzle `User` (keeps the test
importable + cms-auth-mirror-able). 90/90 tests, tsc + opennext build green.

PICK NEXT: **Slice 3 — dynamic tags data model + Manager country-AND-tag reach.**
- COUNTRY STAYS EXACTLY AS IT IS (USER 2026-06-21). Add a SEPARATE managed tagging
  system ALONGSIDE country. New tables: `tags` (id, label — CRUD in Slice 3b),
  `user_tags` (PK userId+tagId), `site_tags` (PK siteId+tagId). Mirror the
  `userCountries` join shape (`db/schema.ts` ~line 162). Drizzle migration — BUT note
  this IS a structural change (real new tables), so unlike Slice 1's data-only 0006,
  `drizzle-kit generate` SHOULD scaffold it; still verify the journal/snapshot chain.
- ACCESS RULE = AND across dimensions: Manager reaches a Site when
  country ∈ Manager.countries AND a tag ∈ Manager.tags (within a dimension: OR/any-of).
  Extend `canManageSiteByCountry` (`lib/site/authz.ts`) → `canManageSite(actor,
  actorCountries, actorTagIds, site, siteTagIds)` keeping existing country logic +
  adding the tag conjunction; thread through `listSitesForUser`. Editor by assignment,
  SuperAdmin/Admin global (no scope). Helpers to read a user's tagIds + a site's tagIds.
- The access rule should be a PURE, node-testable helper too (same alias-free pattern
  as removal.ts) — tests: country-only → DENIED, tag-only → DENIED, both → ALLOWED,
  Editor by assignment, Admin global.

Gate: `tsc --noEmit`, `npm test`, `npx opennextjs-cloudflare build` (NOT while
`npm run dev` is up — confirm port 3601 free first). EN/FI/ET only if you add
user-facing strings (Slice 3 is schema + pure logic; tag UI labels land in 3b/5).

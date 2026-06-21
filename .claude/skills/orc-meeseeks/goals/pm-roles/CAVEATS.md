# Caveats — pm-roles
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **`SiteManager` is being REMOVED.** Today's `Role = SuperAdmin | Admin | SiteManager`
  (`db/schema.ts:18`). The new set is `SuperAdmin | Admin | Manager | Editor`.
  SiteManager's assigned-site behavior → **Editor**; **Manager** is a NEW
  country+tag-scoped tier. MIGRATE existing `SiteManager` rows → `Editor` in the
  same migration that changes the enum, and grep the WHOLE PM for `"SiteManager"`
  (authz, i18n, UI labels, tests) — leave none dangling.

- **No removal barriers exist today.** There is currently NO rule preventing one
  user from removing another, and in fact NO user-delete route or global
  user-management UI at all (verified 2026-06-21 — only per-Site `setSiteUsers`).
  The whole "Admin can't remove SuperAdmin / Manager can't remove SuperAdmin or
  Admin" hierarchy is net-new. Put it in ONE pure helper `canRemoveUser(actor,
  target)` and enforce it on the new delete route AND the role-change route (you
  shouldn't be able to demote/elevate above your own tier either).

- **Tags are entirely absent.** No tag column/table anywhere. This goal ADDS them.
  USER DECISION 2026-06-21: **Sites carry tags; a Manager reaches a Site when
  country ∈ Manager.countries AND a tag ∈ Manager.tags (BOTH must match).** Model
  tags like countries: a `user_tags` join (Manager's tags) + a `site_tags` join
  (Site's tags), and likely a managed `tags` table so they're a pickable list (vs.
  free-form strings — pick one in the schema slice and note why).

- **Reuse the country pattern, don't reinvent.** `userCountries` (PK userId+country),
  `COUNTRY_CODES`, `getUserCountries`, `canManageSiteByCountry`. Tags + the Manager
  reach rule should mirror this shape. Rename `canManageSiteByCountry` →
  `canManageSite` once it factors in BOTH country and tag (or keep both, but make
  the combined rule the single source of truth used by `listSitesForUser`).

- **No native confirm()/alert() in any UI.** Browser-automation review sessions
  hang on native dialogs (CLAUDE.md). The "remove user" confirm is an in-app modal.

- **Migrations are real D1 migrations.** Adding tag tables + changing the role enum
  needs a Drizzle migration (SQLite has no native ALTER for CHECK/enum — the role
  is a text column with a `$type<Role>()`, so the enum change is type-level + a
  data UPDATE for SiteManager→Editor, not a column rebuild). Confirm by reading an
  existing migration before writing one.

- **Gate every slice:** PM `tsc` + `npx opennextjs-cloudflare build` green (build
  is the deploy gate — NEVER while `npm run dev` is up). PM node tests. EN/FI/ET
  for every new user-facing string (role labels, tag picker, remove confirm,
  errors).

- **This role set is shared with the CMS (`cms-auth` subgoal).** Land the role
  NAMES + `canRemoveUser` here first in a clean, mirror-able shape; cms-auth copies
  it (minus PM-only bits) and maps "PM user with CMS-site access = CMS Admin".

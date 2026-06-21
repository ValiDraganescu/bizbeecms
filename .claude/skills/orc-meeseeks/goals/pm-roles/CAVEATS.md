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

- **Tags are entirely absent today.** No tag column/table anywhere. This goal ADDS
  a dynamic, MANAGED tagging system. USER DECISIONS 2026-06-21:
  - **Country stays EXACTLY as it is** — do NOT touch/rename/fold `COUNTRY_CODES`,
    `user_countries`, or the Site `country` column. Tags are a SEPARATE system that
    lives ALONGSIDE country. (The user explicitly: "we keep country as it is and
    introduce a new tagging system.") Do not try to make country "just a tag".
  - **Tags are MANAGED (CRUD)** — a `tags` table that Admins create/rename/delete
    (Slice 3b), used for org labels like company group / TO channel. Pickable list,
    not free-form per-site strings.
  - **Manager reach = AND across dimensions**: country ∈ Manager.countries AND a
    tag ∈ Manager.tags (within each dimension, any-of/OR; between dimensions, AND).
    Both `user_tags` (Manager's tags) and `site_tags` (Site's tags) join by tagId.

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

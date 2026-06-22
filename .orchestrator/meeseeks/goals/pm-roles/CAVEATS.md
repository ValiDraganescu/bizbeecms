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

- **PM tests run on `node --test` with native TS, NO path alias.** `npm test` runs
  `node --test 'src/lib/**/*.test.ts'`. Node's TS type-stripping does NOT resolve the
  `@/...` tsconfig alias, so a test can only import modules that are themselves
  alias-free (e.g. `cms-sso.ts`). Most `lib` modules (`invite/authz.ts`,
  `site/authz.ts`) import `@/lib/...` internally and are therefore NOT importable
  from a bare test — `ERR_MODULE_NOT_FOUND`. Slice 1's `roles.test.ts` asserts
  against source TEXT + the message JSONs instead. For Slice 2's `canRemoveUser`,
  keep it in a NEW alias-free pure module (only `import type`, no runtime `@/`
  imports) so it's directly testable — or the test must read source text again.

- **The Role enum change is a no-op for `drizzle-kit generate`.** It emits NOTHING
  ("No schema changes") because the column is plain `text`. The data UPDATE had to be
  HAND-AUTHORED as `migrations/0006_*.sql` + registered manually in
  `migrations/meta/_journal.json` (append an entry) and a `0006_snapshot.json` added
  (copy the previous snapshot, give it a fresh `id` and `prevId`=previous id, since
  there's no structural diff). DON'T expect `db:generate` to scaffold a data-only
  migration for you.

- **FI/ET role labels (use these, don't re-translate):** Manager = FI `Päällikkö`,
  ET `Haldur`; Editor = FI `Toimittaja`, ET `Toimetaja`. SuperAdmin/Admin unchanged.

- **`canRemoveUser`/`canChangeRole` are TIER-ONLY (Slice 2, `lib/auth/removal.ts`).**
  They answer "does the actor outrank the target?" and nothing else. They do NOT take
  scope — a Manager's country+tag reach is a SEPARATE, ADDITIONAL gate (Slice 3). When
  Slice 4 wires the delete/role-change routes, the route must check BOTH
  `canRemoveUser(...)` AND scope (`canManageSite`/the country+tag rule). Don't fold
  scope into removal.ts — keep the tier rule pure and mirror-able for cms-auth.

- **`removal.ts` uses `RoleActor = {id, role}`, NOT the full `User`.** `User` =
  `typeof users.$inferSelect` drags in the Drizzle runtime, which would break the bare
  node test (alias/runtime import). Keep the minimal structural shape; callers pass
  `{ id, role }`. Self-removal is blocked by the `id` equality check, so routes MUST
  pass real ids (a Manager removing another Manager with a different id IS still
  denied by tier — the self-check only matters for same-tier same-user).

- **Slice 3 done — the SCOPE rule lives in `lib/site/scope.ts` (pure, alias-free).**
  `canManageSite(actor, countries, tagIds, {country, tagIds})` is the SINGLE source of
  truth for reach-by-scope. `lib/site/authz.ts` wraps it (with a runtime `User`) and
  STILL exports `canManageSiteByCountry` as a deprecated alias — DON'T delete the alias
  until Slice 4/5 migrate every route caller to pass `actorTagIds`+`site.tagIds`. Today
  all route callers pass the defaults (`actorTagIds=[]`, `site.tagIds=[]`), which is
  CORRECT for SuperAdmin/Admin/Editor and is why no route changed; a Manager with
  empty tags reaches nothing (intended). When Slice 4/5 add Manager-aware routes, pass
  the real tag ids via `getUserTagIds`/`getSiteTagIds`.
- **Tags reach is AND-with-country and tags ONLY gate Manager.** For Admin, tags are
  ignored (country is the only scope). Don't add a tag gate to the Admin path — GOAL
  says Admins set Managers' tags but Admin reach itself stays country-only.
- **`0007_tags.sql` WAS scaffolded by `drizzle-kit generate`** (unlike Slice 1's
  hand-authored data-only 0006) because new tables are a real structural diff. The
  meta journal + 0007_snapshot.json were auto-written. Future tag-schema tweaks: just
  re-run `drizzle-kit generate`.

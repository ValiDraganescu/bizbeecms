# Journal — pm-roles
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 11:42 — Slice 1: role enum SuperAdmin|Admin|Manager|Editor + SiteManager→Editor migration
- **Status:** DONE
- **What I did:**
  - `db/schema.ts` `Role` → `"SuperAdmin" | "Admin" | "Manager" | "Editor"` (+ comment).
  - Hand-authored data migration `migrations/0006_site_manager_to_editor.sql`:
    `UPDATE users/invites SET role='Editor' WHERE role='SiteManager'`. The role
    column is plain `text` ($type only, NO CHECK), so the enum change is
    SQL-invisible — confirmed `drizzle-kit generate` says "No schema changes".
    Registered 0006 in `migrations/meta/_journal.json` + chained a `0006_snapshot.json`
    (copy of 0005 with fresh id/prevId, since there's no structural diff).
  - Editor == old SiteManager behaviour (assigned-sites only). Behavioural branches
    renamed: `listSitesForUser` guard `!== "SiteManager"` → `!== "Editor"`;
    `INVITABLE_ROLES` now `["Admin","Editor"]`.
  - Removed ALL `SiteManager`/`siteManager` refs across src + messages (authz comments,
    site.ts, app-nav/invite/accept `roleKey` records now have all 4 keys,
    invite-form role-label map generalized to `firstLowercase(role)`, design-system
    page options/badges, combobox demos). Only 1 intentional history mention left in
    a schema.ts comment.

## 2026-06-22 12:30 — Slice 2: removal hierarchy `canRemoveUser` + `canChangeRole` (pure, tested)
- **Status:** DONE
- **What I did:**
  - NEW alias-free pure module `src/lib/auth/removal.ts`: a `RANK` map
    (SuperAdmin 3 > Admin 2 > Manager 1 > Editor 0) + two pure helpers.
    `canRemoveUser(actor, target)`: strict `RANK[actor] > RANK[target]` AND
    different `id` (no self-removal) — gives exactly SuperAdmin↛SuperAdmin,
    Admin↛SuperAdmin, Manager↛(SuperAdmin/Admin), Editor↛anyone.
    `canChangeRole(actor, target, newRole)`: same self-check + must outrank the
    target's CURRENT tier AND the DESTINATION tier (no elevating to/above own peerage).
  - Imports ONLY `import type { Role }` (erased at runtime) → node-test importable.
    Local `RoleActor = {id, role}` shape, NO drizzle/`@/` runtime dep, so cms-auth
    can copy it verbatim.
  - Test `src/lib/auth/removal.test.ts` (8 tests): full 4×4 removal matrix, self-
    removal, spec sentences, and canChangeRole (self, current-tier, dest-tier
    elevate guard, SuperAdmin grants, Editor-no-op).
  - NO route wired (Slice 4's job) — pure logic + tests this slice.
- **Verified:** `tsc --noEmit` clean; `npm test` 90/90 (8 new removal tests pass);
  `npx opennextjs-cloudflare build` complete (dev server confirmed down first).
  Scope (Manager country+tag reach) NOT enforced here by design — Slice 3 adds it
  as an additional gate on top of this tier rule.
- **Files:** `ProjectManager/src/lib/auth/removal.ts`,
  `ProjectManager/src/lib/auth/removal.test.ts`.
  - i18n EN/FI/ET: `roles.siteManager` → `roles.manager` + `roles.editor`
    (EN Manager/Editor, FI Päällikkö/Toimittaja, ET Haldur/Toimetaja). Parity verified.
  - Regression test `src/lib/roles.test.ts` (3 tests): Role union is the 4-role set/no
    SiteManager, no source file references the token, every locale has exactly one
    lowercase-first key per role.
- **Verified:** PM `tsc --noEmit` clean; `npm test` 82/82 pass (3 new); `npx
  opennextjs-cloudflare build` complete; `drizzle-kit generate` → no drift; grep
  shows no dangling SiteManager (bar the 1 history comment). NOT verified: migration
  applied against a real D1 (no rows to migrate in dev; it's a no-op UPDATE anyway).
- **Files:** `ProjectManager/src/db/schema.ts`, `migrations/0006_site_manager_to_editor.sql`,
  `migrations/meta/_journal.json`, `migrations/meta/0006_snapshot.json`,
  `src/lib/invite/authz.ts`, `src/lib/site/authz.ts`, `src/lib/site/site.ts`,
  `src/lib/auth/countries.ts`, `src/components/nav/app-nav.tsx`,
  `src/components/ui/combobox.tsx`, `src/components/design-system/combobox-demos.tsx`,
  `src/app/(app)/invite/page.tsx`, `src/app/(app)/invite/invite-form.tsx`,
  `src/app/(auth)/invite/accept/[token]/page.tsx`, `src/app/(app)/sites/page.tsx`,
  `src/app/(app)/sites/[id]/page.tsx`, `src/app/design-system/page.tsx`,
  `messages/{en,fi,et}.json`, `src/lib/roles.test.ts`.

## 2026-06-22 12:36 — Slice 3: dynamic tags data model + Manager country-AND-tag reach
- **Status:** DONE
- **What I did:** Added the tag system ALONGSIDE country (country untouched).
  - Schema: `tags` (id, unique label, createdAt), `user_tags` (PK userId+tagId),
    `site_tags` (PK siteId+tagId), all with onDelete cascade. + their `$inferSelect/Insert`
    types. Migration `0007_tags.sql` scaffolded by `drizzle-kit generate --name tags`
    (journal/snapshot chain auto-updated — this is a real structural change, NOT a
    data-only migration like Slice 1's 0006).
  - PURE rule `src/lib/site/scope.ts` `canManageSite(actor, countries, tagIds, {country, tagIds})`
    — alias-free, the single source of truth. SuperAdmin/global-Admin → all; scoped-Admin
    → country-only (tags ignored for Admin per GOAL); Manager → country AND tag (any-of
    within a dimension, AND between); Editor → nothing by scope. 8 node tests `scope.test.ts`.
  - `lib/site/authz.ts`: `canManageSiteByCountry` → `canManageSite` (now delegates to
    scope.ts, accepts optional `site.tagIds` + `actorTagIds`); kept `canManageSiteByCountry`
    as a deprecated alias so ALL existing routes compile unchanged (they pass tagIds=[]
    → no Manager users exist yet, so Admin/SuperAdmin/Editor behavior is byte-identical).
  - DB helpers: `getUserTagIds` (user.ts), `getSiteTagIds` + private `getSiteIdsWithAnyTag`
    (site.ts). `listSitesForUser` got a Manager branch: country ∈ scope AND tag overlap,
    UNION assignment.
- **Verified:** `npx tsc --noEmit` exit 0; `npm test` 98/98 (8 new); `npx opennextjs-cloudflare build` green (port 3601 confirmed free first).
- **Files:** `ProjectManager/src/db/schema.ts`, `ProjectManager/migrations/0007_tags.sql`
  (+ meta/_journal.json, meta/0007_snapshot.json auto-gen),
  `ProjectManager/src/lib/site/scope.ts` (new), `ProjectManager/src/lib/site/scope.test.ts` (new),
  `ProjectManager/src/lib/site/authz.ts`, `ProjectManager/src/lib/site/site.ts`,
  `ProjectManager/src/lib/auth/user.ts`.

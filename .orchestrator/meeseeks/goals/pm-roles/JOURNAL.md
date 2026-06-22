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

## 2026-06-22 12:43 — Slice 3b: tag management CRUD (API + UI, Admin+ gated)
- **Status:** DONE
- **What I did:** Built the managed-tag admin surface that curates the `tags`
  vocabulary Slice 3 introduced.
  - DB helpers `src/lib/tags/tags.ts`: `listTags` (alpha by label), `isLabelTaken`
    (case-insensitive, optional exclude id), `createTag`/`renameTag`/`deleteTag`.
    DELETE relies on the schema's onDelete cascade to drop `site_tags`/`user_tags`.
  - PURE alias-free `src/lib/tags/validate.ts` `parseTagLabel` (trim + collapse inner
    whitespace, non-empty, <=50 chars) -> node-testable (5 tests, `validate.test.ts`).
  - REST `app/api/tags/route.ts` (GET list + POST create) and
    `app/api/tags/[id]/route.ts` (PATCH rename + DELETE). All gated Admin+
    (`canManageTags` = SuperAdmin|Admin; GET reuses `canUserCreateSite`). Duplicate
    label -> 409 `labelTaken` (checked before write + caught on the unique-index race).
    404 on missing id for PATCH/DELETE.
  - UI `app/(app)/tags/page.tsx` (server, redirects non-Admin+) + client
    `tags-manager.tsx`: add form, inline rename, delete behind an IN-APP confirm modal
    (overlay dialog, NEVER window.confirm - CAVEATS). Reuses design-system Card/Table/
    Button/Field/Alert + purpose tokens. Optimistic local list, re-sorted by label.
  - Nav: `/tags` link added to `app-nav.tsx`, shown only to Admin+ (`canUserCreateSite`).
  - i18n EN/FI/ET: new `tags.*` namespace (navLink/back/title/subtitle/info/list/form/
    actions/delete/errors) in all three message files. FI/ET role-consistent wording.
- **Verified:** `npx tsc --noEmit` exit 0; `npm test` 103/103 (5 new); `npx
  opennextjs-cloudflare build` green (port 3601 confirmed free first) with `/tags` in the
  route list; all three messages JSON parse. NOT verified: live D1 CRUD round-trip (no
  running dev server this run) and a real browser confirm-modal click.
- **Files:** `ProjectManager/src/lib/tags/tags.ts` (new),
  `ProjectManager/src/lib/tags/validate.ts` (new),
  `ProjectManager/src/lib/tags/validate.test.ts` (new),
  `ProjectManager/src/app/api/tags/route.ts` (new),
  `ProjectManager/src/app/api/tags/[id]/route.ts` (new),
  `ProjectManager/src/app/(app)/tags/page.tsx` (new),
  `ProjectManager/src/app/(app)/tags/tags-manager.tsx` (new),
  `ProjectManager/src/components/nav/app-nav.tsx`,
  `ProjectManager/messages/{en,fi,et}.json`.

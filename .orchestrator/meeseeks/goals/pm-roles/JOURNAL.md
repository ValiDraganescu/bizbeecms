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

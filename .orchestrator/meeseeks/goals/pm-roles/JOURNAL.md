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

## 2026-06-22 12:49 — Slice 4: global User-Management API
- **Status:** DONE
- **What I did:** NEW REST `app/api/users/*` (Admin+ gated). `GET /api/users`
  lists every user with role+countries+tags (`listUsersWithScope`). `PATCH
  /api/users/[id]` changes role + sets countries + tags, enforcing BOTH gates:
  tier (`canChangeRole` from removal.ts — blocks self-edit, peer/superior re-role,
  elevation to/above own tier) AND the NEW subset rule (`authorizeAssign` in
  pure alias-free `lib/auth/manage-users.ts` — a scoped actor may grant only
  countries/tags within its own scope; global actors grant anything). `DELETE
  /api/users/[id]` enforces `canRemoveUser` (tier only). Next15 async-params
  shape copied from `app/api/tags/[id]`. Added DB helpers to `lib/auth/user.ts`:
  `setUserCountries`, `setUserTags`, `setUserRole`, `deleteUser`,
  `listUsersWithScope`. Added `users.errors` namespace EN/FI/ET (Slice 5 UI will
  consume). Pure subset rule node-tested (`manage-users.test.ts`, 5 tests).
- **Verified:** PM `npm test` 108 pass (was 103, +5), `tsc --noEmit` exit 0,
  `npx opennextjs-cloudflare build` green with `/api/users` + `/api/users/[id]`
  in the route tree (dev confirmed off on 3601 before build). Did NOT exercise
  routes against a live D1 (no running PM) — authz wiring is the node-tested part;
  the route handler glue is type-checked + build-verified only.
- **Files:** `ProjectManager/src/lib/auth/manage-users.ts` (new),
  `ProjectManager/src/lib/auth/manage-users.test.ts` (new),
  `ProjectManager/src/lib/auth/user.ts`,
  `ProjectManager/src/app/api/users/route.ts` (new),
  `ProjectManager/src/app/api/users/[id]/route.ts` (new),
  `ProjectManager/messages/{en,fi,et}.json`.

## 2026-06-22 12:54 — Slice 5: global User-Management UI
- **Status:** DONE
- **What I did:** New PM page `app/(app)/users/page.tsx` (server, Admin+ gated, redirects others; passes actor role+scope + managed tags + users list to the client). `users-manager.tsx` (client): users table (email, role, country/tag badges, scope), inline EditRow with role Combobox + country & tag multiselect Comboboxes (option sets limited to the actor's grantable scope, mirroring `authorizeAssign`), wired to `PATCH /api/users/[id]`; Remove behind an in-app `ConfirmRemoveModal` (no window.confirm) wired to `DELETE`. Client tier gate mirrors removal.ts RANK to hide Edit/Remove on equal/higher tiers + the actor's own row (API is still the real gate). Added `/users` NavLink in `app-nav.tsx`, gated Admin+ (new `isAdminPlus`). Extended the `users` i18n namespace (navLink/back/title/subtitle/list/edit/actions/remove) in EN/FI/ET, keeping the existing `users.errors`.
- **Verified:** tsc 0; npm test 108 pass (no new test — UI slice; tier logic duplicates already-tested removal.ts); `opennextjs-cloudflare build` green with `/users` in the route list. Dev server confirmed NOT running before build.
- **Files:** ProjectManager/src/app/(app)/users/page.tsx, ProjectManager/src/app/(app)/users/users-manager.tsx, ProjectManager/src/components/nav/app-nav.tsx, ProjectManager/messages/{en,fi,et}.json

## 2026-06-22 13:02 — Slice 6: invite flow → Manager/Editor + tags
- **Status:** DONE
- **What I did:** Extended the invite flow to the new role set + tag scope.
  - schema: new `invite_tags` table (mirrors `invite_countries`, FK→invites+tags,
    onDelete cascade) + types; migration `0008_ambiguous_carnage.sql` scaffolded by
    `drizzle-kit generate` (journal/snapshot chain auto-updated — new table = real diff).
  - `lib/invite/authz.ts`: `INVITABLE_ROLES` now `["Admin","Manager","Editor"]`;
    `authorizeInvite` takes `inviterTagIds`+`tagIds` and DELEGATES the country+tag
    subset to `authorizeAssign` (manage-users.ts) — single source of truth shared
    with PATCH. Tags only granted for `role === "Manager"`. New error key `tagNotAllowed`.
  - `lib/invite/invite.ts`: `createInvite` stores tag rows; `getInviteTags` +
    `getInviteTagsMap`; `acceptInvite` reads tags + passes to `createUser`.
  - `lib/auth/user.ts`: `createUser` accepts `tagIds` (inserts userTags on create).
  - `app/api/invite/route.ts`: parses `tagIds` (Manager-only), loads inviter
    countries+tags, calls authorizeInvite with both, forwards tagIds to createInvite.
  - UI: `invite-form.tsx` shows a tag multiselect ONLY when role=Manager (grantable
    tags mirror authorizeAssign); `invite/page.tsx` passes inviter tags + managedTags
    and renders a Tags column in the pending list.
  - i18n EN/FI/ET: invites.form.{tags,tagsPlaceholder,tagsHint}, pending.tags,
    errors.tagNotAllowed.
- **Verified:** `npx tsc --noEmit` clean; `npm test` 112 pass (108→112, +4 new in
  `lib/invite/authz-slice6.test.ts`); `npx opennextjs-cloudflare build` complete
  (no dev server running). Subset rule itself already covered by manage-users.test.ts;
  new test asserts invite-specific wiring via source text (authz.ts can't bare-import @/).
- **Files:** ProjectManager/src/db/schema.ts, migrations/0008_ambiguous_carnage.sql
  (+meta journal/snapshot), src/lib/invite/{authz,invite}.ts,
  src/lib/invite/authz-slice6.test.ts, src/lib/auth/user.ts,
  src/app/api/invite/route.ts, src/app/(app)/invite/{page,invite-form}.tsx,
  messages/{en,fi,et}.json.

## 2026-06-22 13:07 — Slice 7: Site-detail tag picker
- **Status:** DONE
- **What I did:** Closed the last functional gap in the Manager scope story — a Site
  can now carry org tags from the UI, making Manager country-AND-tag reach usable
  end-to-end (previously no Site could ever HAVE a tag, so every Manager's set was
  empty). Added `setSiteTags(siteId, tagIds)` to `lib/site/site.ts` (delete-all+insert
  full replace, mirrors `setUserTags`); `PUT /api/sites/[id]/tags/route.ts` gated
  Admin+ via `canUserCreateSite` and re-validating ids against `listTags()`;
  `SiteTagsForm` client component (Combobox multiselect, mirrors `assign-form.tsx`)
  wired into `sites/[id]/page.tsx` inside the `canManage` block, additionally gated
  `canUserCreateSite(user)` (Admin+, matches tag-management tier). EN/FI/ET
  `sites.tags.*` strings. Regression test `lib/site/site-tags-slice7.test.ts`
  (source-text + i18n, alias-free pattern per CAVEATS).
- **Verified:** PM `tsc --noEmit` exit 0; `npm test` 115 pass / 0 fail (+3 new);
  `npx opennextjs-cloudflare build` green (dev not on 3601). Could not exercise the
  route at runtime (no live D1 in this run) — gated by tsc+build like Slice 4's routes.
- **Files:** ProjectManager/src/lib/site/site.ts,
  ProjectManager/src/app/api/sites/[id]/tags/route.ts,
  ProjectManager/src/app/(app)/sites/site-tags-form.tsx,
  ProjectManager/src/app/(app)/sites/[id]/page.tsx,
  ProjectManager/src/lib/site/site-tags-slice7.test.ts,
  ProjectManager/messages/{en,fi,et}.json

## 2026-06-23 08:35 — BUG [P2]: revoke a pending invitation (PM had no cancel)
- **Status:** DONE
- **What I did:**
  - `lib/invite/invite.ts` `deleteInvite(id)`: `DELETE ... WHERE id=? AND acceptedAt
    IS NULL` `.returning()` → bool. Scope rows (`invite_countries`/`invite_tags`)
    drop via their FK cascade — no manual cleanup. Re-checks pending so an accepted
    invite 404s.
  - `app/api/invite/[id]/route.ts` `DELETE` (Next 15 async-params shape): gated by
    `canUserInvite(user)` — the SAME authz as POST — 403 otherwise; 404 when
    `deleteInvite` returns false. REST-only (server actions 500 on OpenNext).
  - Extracted the formerly-inline pending table from `invite/page.tsx` into a client
    `invite/pending-invites.tsx`. The server page now pre-resolves each row to plain
    strings (`PendingInvite[]`: roleLabel/countryText/tagLabels/expires) so the client
    stays a thin shell. Per-row "Revoke" ghost-danger button → in-app confirm modal
    (copy of the users-manager dialog pattern, role=dialog aria-modal, NO native
    confirm) → `fetch(DELETE)` then `router.refresh()`; error Alert on failure.
  - EN/FI/ET: added `invites.revoke.{action,title,body,confirm,cancel,error}` +
    `invites.pending.actions`. FI/ET hand-translated.
  - Regression test `lib/invite/revoke-bug-2026-06-23.test.ts` (source-text + i18n;
    route imports `@/` so not bare-node-importable — same strategy as Slices 1/4/5).
- **Gate:** tsc 0, 150 node tests pass, `npx opennextjs-cloudflare build` green
  (dev not on 3601). No live-D1 runtime exercise this run.
- **Files:** ProjectManager/src/lib/invite/invite.ts,
  ProjectManager/src/app/api/invite/[id]/route.ts,
  ProjectManager/src/app/(app)/invite/pending-invites.tsx,
  ProjectManager/src/app/(app)/invite/page.tsx,
  ProjectManager/src/lib/invite/revoke-bug-2026-06-23.test.ts,
  ProjectManager/messages/{en,fi,et}.json

## 2026-06-23 11:32 — Promote confirm/overlay-dialog to components/ui (ConfirmDialog)
- **Status:** DONE
- **What I did:** The destructive-confirm overlay-dialog was copy-pasted in THREE
  call sites (tags-manager `ConfirmDeleteModal`, users-manager `ConfirmRemoveModal`,
  invite/pending-invites inline modal). Extracted ONE shared `<ConfirmDialog>`
  (`components/ui/confirm-dialog.tsx`, exported from the barrel): role=dialog
  aria-modal overlay (bg-black/50, click-overlay-cancels, panel stopPropagation),
  danger Alert body, ghost Cancel + danger Confirm with `loading`. Props are
  text/labels + onCancel/onConfirm so i18n stays at each call site. Migrated all
  three callers to it and deleted the two helper fns + the inline block; dropped now-
  unused `Alert`/`AlertBody` imports from tags-manager and users-manager (invite keeps
  them for its error banner). Updated the revoke regression test: it now asserts the
  page renders `<ConfirmDialog` and that the shared component carries aria-modal (the
  aria-modal text moved out of the page into the shared component).
- **Verified:** PM `tsc --noEmit` clean; `npm test` 150/150 pass; `npx
  opennextjs-cloudflare build` complete (dev 3601 confirmed down first). No leftover
  `ConfirmDeleteModal`/`ConfirmRemoveModal` refs. Pure UI refactor — no behavior/string
  change; NOT smoke-tested in a live browser.
- **Files:** components/ui/confirm-dialog.tsx (new), components/ui/index.ts,
  app/(app)/tags/tags-manager.tsx, app/(app)/users/users-manager.tsx,
  app/(app)/invite/pending-invites.tsx, lib/invite/revoke-bug-2026-06-23.test.ts

## 2026-06-23 11:37 — Editor invite→assignment follow-up: harden + test the per-Site assign-list candidacy
- **Status:** DONE
- **What I did:** Verified the Editor path end-to-end in source (accept → role Editor, NO countries/tags; `listSitesForUser` Editor branch reaches assigned-only; `INVITABLE_ROLES` includes Editor). Found the assign-list candidacy filter in `listAssignableUsers` was an untested inline predicate. Extracted it to a PURE alias-free `lib/site/assignable.ts` `isAssignableToSite(userCountries, siteCountry)` (mirrors scope.ts/removal.ts pattern) and made `site.ts` delegate to it — behavior unchanged, now locked by a test. The contract: a global/no-country user (incl. every Editor) is assignable to ANY Site incl. global; a country-scoped user only within its countries and never to a global Site.
- **Verified:** tsc 0; `npm test` 154 pass (was 150, +4 new in `assignable.test.ts`); opennext build complete. Confirmed fails-before by mutating the predicate (`length===0 → false`): 2 of 4 tests fail, then restored. Did NOT run live D1 (no live env here) — Editor smoke at https://bizbee.localhost still pending.
- **Files:** `src/lib/site/assignable.ts` (new), `src/lib/site/assignable.test.ts` (new), `src/lib/site/site.ts` (delegate `listAssignableUsers`).

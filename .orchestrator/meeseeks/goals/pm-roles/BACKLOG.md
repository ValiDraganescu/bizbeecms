# Backlog — pm-roles
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

- DONE (2026-06-23): **BUG [P2] — PM has no way to cancel a pending invitation.**
  FIXED: added `deleteInvite(id)` store fn (`lib/invite/invite.ts`, deletes only
  while `acceptedAt IS NULL`; scope rows go via FK cascade) + `DELETE
  /api/invite/[id]/route.ts` gated by `canUserInvite` (same authz as POST), 404
  on missing/already-accepted. Extracted the pending table into a client
  `pending-invites.tsx` with a per-row "Revoke" ghost-danger button + in-app
  confirm modal (no native confirm) that calls the DELETE then `router.refresh()`.
  EN/FI/ET `invites.revoke.*` + `invites.pending.actions`. Regression test
  `lib/invite/revoke-bug-2026-06-23.test.ts` (source-text + i18n, fails-before).
  Gate: tsc 0, 150 node tests, opennext build green.

## Tasks
Build order: role enum + migration FIRST (everything keys off the names), then the
removal hierarchy, then tags, then the management UI/API. Each slice gates on PM
tsc + opennext build green + PM node tests + EN/FI/ET for new strings.

- DONE (2026-06-22): **Slice 1 — new role enum + SiteManager→Editor migration.** Change
  `ProjectManager/src/db/schema.ts:18` `Role` to
  `"SuperAdmin" | "Admin" | "Manager" | "Editor"`. Drizzle migration: UPDATE all
  `users.role = 'SiteManager'` → `'Editor'` (the role column is text + `$type`, so
  this is a data UPDATE, not a column rebuild — confirm against an existing
  migration). Grep the WHOLE PM for `"SiteManager"` and replace in authz, i18n
  (role labels — add `Manager`/`Editor`, keep EN/FI/ET), UI, tests. Existing authz
  semantics for the renamed role stay equivalent for now (Editor == old
  SiteManager: assigned-sites only); Manager-specific scope comes in Slice 3. Pure
  helpers untouched except the type. Tests updated to the new names. Gate.

- DONE (2026-06-22): **Slice 2 — removal hierarchy (the core new rule).** Pure
  alias-free module `src/lib/auth/removal.ts`: `canRemoveUser(actor, target)` +
  `canChangeRole(actor, target, newRole)` over a RANK map (SuperAdmin>Admin>Manager>
  Editor, strict-greater removes, no self-removal). 8 node tests (`removal.test.ts`)
  cover the full 4×4 matrix + role-change guards. NO route (Slice 4). Scope check
  deferred to Slice 3. All gates green.

- DONE (2026-06-22): **Slice 3 — dynamic tags data model + Manager country-AND-tag
  reach.** New tables `tags`/`user_tags`/`site_tags` (schema.ts) + Drizzle migration
  `0007_tags.sql` (scaffolded by `drizzle-kit generate`, journal/snapshot chain auto-
  updated; onDelete cascade on both joins — Slice 3b relies on it). Pure alias-free
  `lib/site/scope.ts` `canManageSite(actor, countries, tagIds, {country, tagIds})` =
  the single source of truth: SuperAdmin/global-Admin global, scoped-Admin country-
  only, Manager country AND tag (any-of within a dim), Editor nothing. 8 node tests
  (`scope.test.ts`). `lib/site/authz.ts` `canManageSiteByCountry` → `canManageSite`
  (delegates to scope.ts; old name kept as alias so all routes still compile).
  `getUserTagIds`/`getSiteTagIds` DB helpers; `listSitesForUser` Manager branch
  (country ∈ scope AND tag overlap). tsc + 98 node tests + opennext build green.

- DONE (2026-06-22): **Slice 3b — tag management (CRUD the dynamic tags).** USER 2026-06-21:
  "tags can be managed". A small admin surface to create/rename/delete tags in the
  `tags` table (the managed list Slice 3 references), so Admins curate the
  vocabulary (company groups, TO channels, …) before assigning them to Sites/
  Managers. `GET/POST/PATCH/DELETE /api/tags` gated to Admin+ (deleting a tag
  cascades its `site_tags`/`user_tags` rows — confirm onDelete cascade in schema).
  Tiny UI (list + add + rename + delete behind an in-app confirm modal). Reuse
  design-system + purpose tokens; EN/FI/ET. Pure validation (non-empty/unique
  label) node-tested. Gate. (Can land right after Slice 3's schema; the
  user-management UI in Slice 5 consumes this list for the Manager tag picker, and
  the Site detail page gets a tag picker too — note that as part of Slice 5/site UI.)

- DONE (2026-06-22): **Slice 4 — global User-Management API.** NEW REST under
  `app/api/users/*`: `GET` list all users (with role, countries, tags — scoped to
  what the actor may see), `PATCH /api/users/[id]` to change role + set
  countries + set tags (Admins set a Manager's countries/tags), `DELETE
  /api/users/[id]` to remove a user. EVERY mutation gated by `canRemoveUser` /
  the role-change rule (Slice 2) + scope (Slice 3). A Manager can only assign
  countries/tags within its own scope (mirror `authorizeInvite`'s subset rule).
  Node tests for each route's authz (forbidden + allowed paths). Gate.

- DONE (2026-06-22): **Slice 5 — global User-Management UI.** NEW PM page (e.g.
  `app/(app)/users/`): a users table (email, role, countries, tags), inline role
  change, a countries+tags picker (reuse/extend the country picker; add a tag
  multiselect from the managed `tags` table), and a remove action behind an
  IN-APP confirm modal (never `window.confirm`). Show only actions the current
  user is allowed (hide/disable remove on higher tiers). Reuse PM design-system
  components + purpose tokens. EN/FI/ET for all chrome. Gate.

- DONE (2026-06-22): **Slice 7 — Site-detail tag picker (closes Manager reach end-to-end).**
  `setSiteTags(siteId, tagIds)` helper in `lib/site/site.ts` (delete-all+insert,
  mirrors `setUserTags`) + `PUT /api/sites/[id]/tags/route.ts` (Admin+ via
  `canUserCreateSite`, re-validates ids against `listTags()`) + `SiteTagsForm`
  Combobox multiselect (mirrors `assign-form.tsx`) wired into the Site detail page
  inside the `canManage` block, gated `canUserCreateSite(user)` (Admin+). EN/FI/ET
  `sites.tags.*`. `lib/site/site-tags-slice7.test.ts` (source-text + i18n). Without
  this a Site could never carry a tag, so Manager tag-reach was always empty.
  tsc 0, 115 node tests, opennext build green.

- DONE (2026-06-22): **Slice 6 — extend the INVITE flow to the new roles + tags.** Update
  `authorizeInvite` + the invite UI so an inviter can invite at the new roles
  (Manager/Editor) and, for Manager invites, set the invited countries + tags
  (subset of the inviter's own scope, like the existing country subset rule). The
  invite-accept path stores the role + countries + tags on the new user. Node
  tests for the subset/authz rules. EN/FI/ET. Gate. (Keep in sync with cms-auth's
  invite flow — same shape, CMS-local.)

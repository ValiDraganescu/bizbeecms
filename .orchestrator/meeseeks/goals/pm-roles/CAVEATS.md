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

- **Slice 3b done — tag CRUD lives at `lib/tags/` + `app/api/tags/` + `app/(app)/tags/`.**
  Gate = Admin+ via `canManageTags(role)` (SuperAdmin|Admin) in the routes, mirroring
  `canUserCreateSite`. The PATCH/DELETE route is `app/api/tags/[id]/route.ts` and uses the
  Next 15 async-params signature `{ params }: { params: Promise<{ id: string }> }` then
  `await params` — copy that shape for Slice 4's `app/api/users/[id]`.
- **Pure tag validation is `lib/tags/validate.ts` (`parseTagLabel`, alias-free, tested).**
  It only checks SHAPE (non-empty after trim/collapse, <=50). DB uniqueness is a SEPARATE
  store check (`isLabelTaken`, case-insensitive) + the `tags_label_unique` index as the
  race backstop -> both surface as 409 `labelTaken`. Don't fold uniqueness into the pure fn.
- **Button has NO `tone` prop — danger is a `variant`.** `<Button variant="danger">` for a
  solid danger button; for a ghost-danger (inline destructive action) use
  `variant="ghost" className="text-danger hover:bg-danger/10"`. Slice 5's remove-user button
  should follow this.
- **Slice 4 done — user-mgmt API at `app/api/users/*` + the SUBSET rule in
  `lib/auth/manage-users.ts` (pure, alias-free, tested).** `authorizeAssign(actor,
  countries, tagIds)` is the single source of truth for "may the actor GRANT these
  countries/tags?" — global actors (SuperAdmin or country-empty Admin) grant
  anything; a scoped actor must grant a non-empty subset of its OWN countries AND
  only tags it itself holds. PATCH calls BOTH `authorizeAssign` (subset) AND
  `canChangeRole` (tier) — they're orthogonal, don't fold them. DELETE calls only
  `canRemoveUser` (tier). Slice 5's UI must hide actions the API would 403.
- **PATCH role defaults to the target's CURRENT role when `body.role` is omitted**
  so a countries/tags-only edit still passes through `canChangeRole` (which requires
  the actor to outrank the target even for a no-op role) — that's intentional: you
  must outrank someone to touch their scope at all. If Slice 5 wants "edit my own
  tags", that's a DIFFERENT path (self-edit is blocked here by the id check).
- **`setUserCountries`/`setUserTags`/`setUserRole`/`deleteUser`/`listUsersWithScope`
  are the new DB helpers in `lib/auth/user.ts`.** set* are delete-all+insert (full
  replace, not merge). `listUsersWithScope` is N+1 over users (ponytail-marked) —
  fine at PM scale; batch if user counts ever explode. These import `@/db` so they
  are NOT bare-node-testable — that's why the subset RULE lives in the alias-free
  `manage-users.ts` and the routes are gated by tsc+build only, not a route test.
- **Slice 5 done — user-mgmt UI at `app/(app)/users/` + `/users` NavLink (Admin+).**
  `page.tsx` is Admin+ gated (redirects others) and passes the actor's own role+
  countries+tags so the client can pre-hide actions. The client tier gate in
  `users-manager.tsx` (`RANK` map) is a COPY of `lib/auth/removal.ts` RANK — if you
  ever change ranks, change BOTH (the API route is the real gate, this is only UX).
  The Edit row's country/tag option sets are limited to the actor's grantable scope,
  mirroring `manage-users.ts authorizeAssign` (global actor = SuperAdmin or
  country-empty Admin grants anything; scoped actor grants only its own). The remove
  modal is still a hand-rolled `ConfirmRemoveModal` (NOT promoted to components/ui —
  that's now a THIRD copy of the overlay-dialog pattern; promote it if a 4th appears).
- **The delete confirm modal is hand-rolled in `tags-manager.tsx` (`ConfirmDeleteModal`).**
  There's NO shared Modal/Dialog component in `components/ui` yet. If Slice 5 needs another
  confirm modal, consider promoting this overlay-dialog pattern (fixed inset bg-black/50,
  stopPropagation on the panel, role=dialog aria-modal) into `components/ui` instead of
  copy-pasting a third time.

- **Slice 6 done — invite flow grants Manager/Editor + tags.** `INVITABLE_ROLES`
  is now `["Admin","Manager","Editor"]` (NEVER add SuperAdmin). `authorizeInvite`
  no longer hand-rolls the country subset — it DELEGATES country+tag to
  `authorizeAssign` (manage-users.ts), the SAME rule PATCH uses. If you touch the
  subset rule, change it in ONE place (manage-users.ts) and both invite+PATCH follow.
  Tags are gated by `role === "Manager"` in BOTH the route and the form — a
  non-Manager invite carries no tags by construction.
- **`invite_tags` mirrors `invite_countries`** (PK inviteId+tagId, onDelete cascade
  on both FKs). Migration `0008_ambiguous_carnage.sql` was AUTO-scaffolded by
  `drizzle-kit generate` (new table = real diff; journal+snapshot auto-chained — no
  hand-authoring like the data-only 0006). `createUser` now takes optional `tagIds`
  (inserts userTags on create); `acceptInvite` copies invite tags → user.
- **The deployer applies migrations** (confirmed earlier in cms-auth Slice 1). The
  new 0008 ships in `migrations/` and gets applied on next Site/PM deploy — no manual
  D1 step needed locally beyond build.

- **Slice 7 done — Site-detail tag picker makes Manager reach usable.** `setSiteTags`
  in `lib/site/site.ts` (delete-all+insert, mirrors `setUserTags`); route is
  `PUT /api/sites/[id]/tags` gated `canUserCreateSite` (Admin+, SuperAdmin|Admin —
  SAME tier as tag mgmt, NOT Editor/Manager), and re-validates posted ids against
  `listTags()` (so a forged id can't be inserted). UI is `SiteTagsForm` (a copy of
  `assign-form.tsx`'s Combobox-multiselect pattern), placed in `sites/[id]/page.tsx`
  inside the `canManage` block but with its OWN `canUserCreateSite(user)` gate — a
  scoped Admin who reaches the site by country still sees it; a Manager/Editor never
  does. No new migration (site_tags already existed since Slice 3).
- **BUG 2026-06-23 fixed — invite revoke = `DELETE /api/invite/[id]`.** `deleteInvite`
  (`lib/invite/invite.ts`) deletes the invite row ONLY while `acceptedAt IS NULL` and
  relies on the FK cascade on `invite_countries`/`invite_tags` to drop scope rows — do
  NOT hand-delete those (and don't drop the cascade from the schema). Route gated by
  `canUserInvite` (SAME authz as creating one — no separate revoke tier). The pending
  table is now a CLIENT component `invite/pending-invites.tsx`; the server `page.tsx`
  pre-resolves each row to strings (`PendingInvite[]`) — if you add a column, resolve it
  server-side, don't push Maps/Dates into the client. Confirm modal is a 3rd copy of the
  overlay-dialog pattern (after tags-manager + users-manager) — promoting it to
  components/ui is now justified (see NEXT). NO live-D1 runtime test was run.

- **Site tag picker needs tags to EXIST first.** `sites.tags.none` tells the admin to
  create tags in Tag management (`/tags`) when `listTags()` is empty — a Site can't be
  tagged before the vocabulary exists. The picker hides the form (not an error) in that
  case, matching `assign-form`'s `noneAssignable` empty-state.

- **The confirm/overlay-dialog IS NOW a shared `<ConfirmDialog>` in `components/ui`
  (`confirm-dialog.tsx`, barrel-exported).** All three old copies (tags-manager,
  users-manager, invite/pending-invites) were migrated to it; the per-file
  `ConfirmDeleteModal`/`ConfirmRemoveModal` helpers are GONE — do NOT re-copy the
  overlay pattern, use `<ConfirmDialog title body confirmLabel cancelLabel loading
  onCancel onConfirm />` (i18n stays at the call site; confirm defaults to `danger`
  variant, override via `confirmVariant`). The revoke regression test now asserts on
  `<ConfirmDialog` in the page + `aria-modal` in `confirm-dialog.tsx` (the markup moved
  out of the page) — inlining a modal again breaks it, which is the point. The test's
  `window.confirm` guard on the dialog matches `window\.confirm\(` (the CALL), because
  the file's doc comment literally contains "NEVER window.confirm".

- **Email delivery is LIVE (2026-06-23) via Cloudflare Email Sending, Mode B.** Both
  `wrangler.jsonc` carry `"send_email": [{ "name": "EMAIL" }]` (NO `destination_address`
  — Mode B sends to any invitee; sender domain bizbeecms.com is verified). FROM_ADDRESS
  in BOTH `send-invite.ts` is `noreply@bizbeecms.com` — the from-domain MUST equal the
  verified sender domain or CF rejects; never set it back to `.example` or a different
  domain. `worker-configuration.d.ts` (regenerated by `wrangler types`, NOT gitignored,
  committed) now types `env.EMAIL` — rerun `wrangler types` after ANY wrangler.jsonc
  binding change. The binding only ships after the USER redeploys PM + redeploys a site;
  a code merge alone does NOT enable delivery. CMS binding rides into each per-Site
  Worker via the deployer (no separate step). Did NOT run `bundle:cms` (the deployer
  bundles CMS at deploy time).
- **Assign-list candidacy is COUNTRY-only and lives in `lib/site/assignable.ts`
  (`isAssignableToSite`, pure/alias-free, tested).** `site.ts listAssignableUsers`
  delegates to it. Contract: a user with NO country rows (SuperAdmin, global Admin,
  AND every Editor — Editors carry no scope by construction) is assignable to ANY
  Site incl. a global one; a country-scoped user only within its countries and NEVER
  to a global Site. Tags do NOT gate assignment candidacy (Manager tag reach is
  automatic in `listSitesForUser`; assignment is the manual country-only grant). Do
  NOT add a tag filter here. This was incidental behavior before — now it's a locked,
  tested contract; if you change candidacy, change the predicate + its test together.

# Note to the next Meeseeks (pm-roles)

Slices 1 (role enum + migration), 2 (removal hierarchy), 3 (tags data model +
Manager country-AND-tag reach), and 3b (tag CRUD API+UI) are all DONE.

Slice 3b delivered: `lib/tags/tags.ts` (DB CRUD), `lib/tags/validate.ts`
(pure `parseTagLabel`, alias-free, tested), REST `app/api/tags/route.ts`
(GET+POST) + `app/api/tags/[id]/route.ts` (PATCH+DELETE) all Admin+ gated
(`canManageTags` = SuperAdmin|Admin), and UI `app/(app)/tags/` (page +
`tags-manager.tsx` with inline rename + an in-app delete confirm modal). Nav
`/tags` link shown only to Admin+. EN/FI/ET `tags.*` namespace. tsc + 103 tests
+ opennext build green; `/tags` in the route list. The managed vocabulary is
now CRUD-able, which unblocks the tag pickers in Slice 4/5.

PICK NEXT: **Slice 4 — global User-Management API** under `app/api/users/*`:
- `GET` list users (role, countries, tags — scoped to what the actor may see).
- `PATCH /api/users/[id]` to change role + set countries + set tags. MUST call
  BOTH `canChangeRole` (lib/auth/removal.ts) AND scope — and a Manager may only
  assign countries/tags within its OWN scope (mirror `authorizeInvite`'s subset rule).
- `DELETE /api/users/[id]` to remove a user — MUST call `canRemoveUser`
  (lib/auth/removal.ts) AND scope.
- Pass REAL tag ids: `getUserTagIds` (lib/auth/user.ts) for the actor + the
  target; use scope.ts `canManageSite` with the real ids when reach matters.
- Use the Next 15 async-params route shape (see `app/api/tags/[id]/route.ts`):
  `{ params }: { params: Promise<{ id: string }> }` then `await params`.
- Node tests for each route's authz (forbidden + allowed). EN/FI/ET. Gate
  (tsc + npm test + opennext build, NOT while dev on 3601 is up).

After 4: Slice 5 (global User-Management UI — reuse the tags page's confirm-modal
+ design tokens; add a tag multiselect from the managed list), then Slice 6 (extend
invite to Manager/Editor + tags). PARALLEL-SAFETY: stay OUT of CMS/ and don't run
bundle:cms — another worker owns it.

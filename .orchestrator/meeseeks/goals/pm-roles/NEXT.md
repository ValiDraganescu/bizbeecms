# Note to the next Meeseeks (pm-roles)

Slices 1 (role enum + migration), 2 (removal hierarchy), 3 (tags model +
Manager country-AND-tag reach), 3b (tag CRUD API+UI), and 4 (user-management
API) are all DONE.

Slice 4 delivered:
- `GET /api/users` — list every user w/ role+countries+tags (`listUsersWithScope`),
  Admin+ gated.
- `PATCH /api/users/[id]` — change role + set countries + set tags. Enforces BOTH
  `canChangeRole` (tier, removal.ts) AND `authorizeAssign` (subset rule, NEW pure
  `lib/auth/manage-users.ts`). Role omitted = keep current (still needs to outrank).
- `DELETE /api/users/[id]` — `canRemoveUser` (tier). Cascades scope rows.
- New DB helpers in `lib/auth/user.ts`: setUserCountries/setUserTags/setUserRole/
  deleteUser/listUsersWithScope.
- `users.errors` namespace EN/FI/ET (for the Slice 5 UI to surface 403/400 keys).
- Gate: tsc 0, npm test 108 (was 103), opennext build green w/ both routes.

PICK NEXT: **Slice 5 — global User-Management UI** at `app/(app)/users/`:
- Users table (email, role, countries, tags) from `GET /api/users`.
- Inline role change (select over the 4 roles), a countries picker (reuse the
  invite/site country picker) + a TAG multiselect from the managed `tags` list
  (`GET /api/tags`), wired to `PATCH /api/users/[id]`.
- Remove action behind an IN-APP confirm modal (NEVER window.confirm) — consider
  promoting `tags-manager.tsx`'s `ConfirmDeleteModal` into `components/ui` rather
  than copy-pasting a third time (see CAVEATS).
- HIDE/disable actions the API would 403 (you can compute tier client-side from
  removal.ts's rank, but the server is the real gate). Show `/users` nav link to
  Admin+ only (mirror the `/tags` link gating in `components/nav/app-nav.tsx`).
- Reuse design-system + purpose tokens. EN/FI/ET for all chrome (extend the
  `users` namespace — only `users.errors` exists so far). Gate (tsc + npm test +
  opennext build, NOT while dev on 3601 is up).

After 5: Slice 6 (extend invite to Manager/Editor + tags). PARALLEL-SAFETY:
stay OUT of CMS/ and don't run bundle:cms — another worker owns it.

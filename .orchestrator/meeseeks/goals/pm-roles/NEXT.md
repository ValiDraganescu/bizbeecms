# Note to the next Meeseeks (pm-roles)

Slices 1 (role enum + migration), 2 (removal hierarchy), 3 (tags model +
Manager country-AND-tag reach), 3b (tag CRUD API+UI), 4 (user-management API),
and 5 (user-management UI) are all DONE.

Slice 5 delivered:
- `app/(app)/users/page.tsx` — Admin+ gated server page (redirects others);
  passes actor role+scope + managed tags + users list to the client.
- `app/(app)/users/users-manager.tsx` — users table (email, role, country/tag
  badges), inline EditRow (role Combobox + country & tag multiselects limited to
  the actor's grantable scope, mirroring authorizeAssign), Remove behind an
  in-app ConfirmRemoveModal (no window.confirm). Client tier gate mirrors
  removal.ts RANK to hide actions on equal/higher tiers + the actor's own row.
- `/users` NavLink in app-nav.tsx, gated Admin+.
- `users` i18n namespace extended (navLink/back/title/subtitle/list/edit/
  actions/remove) EN/FI/ET; existing `users.errors` kept.
- Gate: tsc 0, npm test 108, opennext build green with /users in the route list.

PICK NEXT: **Slice 6 — extend the INVITE flow to the new roles + tags.**
- `authorizeInvite` + invite UI: allow inviting at Manager/Editor; for Manager
  invites, set countries + tags (subset of the inviter's own scope — REUSE
  `manage-users.ts authorizeAssign`, same subset rule Slice 5's UI mirrors).
- The invite-accept path must store role + countries + tags on the new user
  (today it stores role + country only — check `invite/route.ts` + the accept
  page). Add a tag multiselect to invite-form.tsx (copy the pattern from
  users-manager.tsx EditRow — `GET /api/tags` for the list).
- Node tests for the subset/authz rules. EN/FI/ET. Gate (tsc + npm test +
  opennext build, NOT while dev on 3601 is up).
- Keep in sync with cms-auth's invite flow (same shape, CMS-local).

PARALLEL-SAFETY: stay OUT of CMS/ and don't run bundle:cms — another worker owns it.

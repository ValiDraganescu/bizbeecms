# Note to the next Meeseeks (pm-roles)

Slices 1–5 + 6 are all DONE. The role overhaul (SuperAdmin/Admin/Manager/Editor),
removal hierarchy, tags model + Manager country-AND-tag reach, tag CRUD, the global
user-management API + UI, AND the invite flow (now grants Manager/Editor + tags)
are all delivered and gated (tsc 0, 112 node tests, opennext build green).

Slice 6 delivered:
- `invite_tags` table + migration `0008_ambiguous_carnage.sql`.
- `authorizeInvite` reuses `authorizeAssign` (single subset source of truth);
  `INVITABLE_ROLES = [Admin, Manager, Editor]`; tags only for Manager invites.
- `createInvite`/`acceptInvite` carry tags; `createUser` takes `tagIds`.
- invite-form shows a tag multiselect when role=Manager; pending list has a Tags
  column; EN/FI/ET strings added; `lib/invite/authz-slice6.test.ts`.

PICK NEXT — the GOAL.md "what good looks like" list is essentially met, but two
gaps are worth a slice:
1. **Site detail tag picker.** GOAL/Slice-3b note says "the Site detail page gets a
   tag picker too" — a Site carries zero+ tags (`site_tags`) but I did NOT see a UI
   to assign them at `app/(app)/sites/[id]`. Without it, Managers can be tag-scoped
   but no Site ever HAS a tag, so Manager reach is always empty in practice. Add a
   tag multiselect on the Site detail page + a `setSiteTags` helper + route (mirror
   `setUserTags` + the tags GET). This is the highest-value remaining slice — it
   makes the whole Manager tag dimension actually usable end-to-end.
2. **Editor invites + assignment.** Editor is invitable now, but an Editor only
   reaches Sites it's ASSIGNED to (`site_users`). Check the invite/accept path
   doesn't need a follow-up site-assignment step, and that the per-Site assign UI
   at `sites/[id]` lists Editors correctly.

Do #1 first — it closes the last functional gap in the Manager scope story.

PARALLEL-SAFETY: stay OUT of CMS/ and don't run bundle:cms — another worker owns it.
PM commands run inside ProjectManager/. tsc + npm test + opennext build, NOT while
dev (3601) is up.

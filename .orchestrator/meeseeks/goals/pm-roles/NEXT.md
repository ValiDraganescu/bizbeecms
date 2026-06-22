# Note to the next Meeseeks (pm-roles)

Slices 1–7 are all DONE. The full GOAL.md "what good looks like" list is now met
end-to-end: role overhaul (SuperAdmin/Admin/Manager/Editor), removal hierarchy,
tags model + Manager country-AND-tag reach, tag CRUD, global user-mgmt API+UI,
invite flow with Manager/Editor+tags, AND (Slice 7) the Site-detail tag picker —
so Sites can actually carry tags and Manager reach works in practice.
All gated: tsc 0, 115 node tests, opennext build green.

Slice 7 delivered:
- `setSiteTags` helper (`lib/site/site.ts`), `PUT /api/sites/[id]/tags` (Admin+,
  re-validates ids vs `listTags()`), `SiteTagsForm` Combobox multiselect wired
  into `sites/[id]/page.tsx` (Admin+ gated). EN/FI/ET `sites.tags.*`.
  `lib/site/site-tags-slice7.test.ts`.

PICK NEXT — the core goal is complete; candidate polish slices (none urgent):
1. **End-to-end Manager smoke (manual/browser).** No live-D1 run has exercised the
   full chain: create a tag → tag a Site → invite/assign a Manager with that country
   + tag → confirm the Manager's `/sites` list shows ONLY matching Sites and the
   detail page is reachable. All the pieces are unit/source-tested but never run
   together against real D1. Worth a browser pass at https://bizbee.localhost.
2. **Editor invite→assignment follow-up.** Editor is invitable but only reaches
   ASSIGNED sites; verify the accept path + per-Site assign UI list Editors right
   (NEXT.md item #2 from the prior run — still unverified end-to-end).
3. **Promote the overlay-dialog/confirm-modal pattern to components/ui** — it's now
   copy-pasted in tags-manager + users-manager (2 copies); a 3rd would justify it.

PARALLEL-SAFETY: stay OUT of CMS/ and don't run bundle:cms — another worker owns it.
PM commands run inside ProjectManager/. tsc + npm test + opennext build, NOT while
dev (3601) is up.

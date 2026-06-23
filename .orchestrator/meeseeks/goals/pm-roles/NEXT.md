# Note to the next Meeseeks (pm-roles)

Bugs section is CLEAR. Slices 1–7 + 2 polish refactors DONE; core goal complete
end-to-end. This run did the **Editor invite→assignment follow-up**: verified the
Editor accept path + `listSitesForUser` Editor-reaches-assigned-only branch are
correct in source, and extracted the per-Site assign-list filter to a PURE
`lib/site/assignable.ts` (`isAssignableToSite`) with 4 tests (fails-before verified
by mutation). `site.ts listAssignableUsers` now delegates — Editor-appears-for-every-
Site is now a locked, tested contract. Gates: tsc 0, 154 node tests, opennext build green.

PICK NEXT — no urgent work; remaining candidates (none blocking):
1. **End-to-end Manager + Editor smoke (manual/browser at https://bizbee.localhost).**
   STILL never run against live D1 (no live env in the Meeseeks runs). Create a tag →
   tag a Site → invite a Manager with that country+tag → `/sites` shows ONLY matching
   Sites. Then invite an Editor (no scope) → assign it to ONE Site via the Site-detail
   assign panel → confirm `/sites` shows ONLY that Site and the assign list actually
   listed the Editor. Eyeball revoke + the three ConfirmDialog dialogs.
2. **Small UI/a11y polish on ConfirmDialog** (focus-trap / Escape-to-close — currently
   overlay-click + buttons only). Only if a real browser review asks for it; YAGNI otherwise.
3. **`listAssignableUsers` loads ALL users + ALL user_countries into memory**
   (ponytail-fine at PM scale). If user counts ever explode, push the country filter
   into SQL. Not now.

PARALLEL-SAFETY: stay OUT of CMS/ and don't run bundle:cms — another worker owns it.
PM commands run inside ProjectManager/. tsc + npm test + opennext build, NOT while
dev (3601) is up.

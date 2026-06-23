# Note to the next Meeseeks (pm-roles)

Bugs section is CLEAR. Slices 1–7 all DONE; core goal complete end-to-end. The
confirm/overlay-dialog is now ONE shared `components/ui/ConfirmDialog` and all
three call sites (tags, users, invite-revoke) use it — no more copy-paste.
Gates this run: tsc 0, 150 node tests, opennext build green.

PICK NEXT — no urgent work; remaining candidates (none blocking):
1. **End-to-end Manager smoke (manual/browser at https://bizbee.localhost).** Still
   never run against live D1: create a tag → tag a Site → invite/assign a Manager
   with that country+tag → confirm `/sites` shows ONLY matching Sites. Also smoke the
   revoke button on a real pending invite, and eyeball the three ConfirmDialog dialogs.
2. **Editor invite→assignment follow-up.** Editor reaches only ASSIGNED sites;
   verify accept path + per-Site assign UI list Editors correctly (still unverified
   end-to-end).
3. **Small UI/a11y polish on ConfirmDialog** if a browser pass surfaces anything —
   e.g. focus-trap / Escape-to-close (currently overlay-click + buttons only). Only
   if a real review asks for it; YAGNI otherwise.

PARALLEL-SAFETY: stay OUT of CMS/ and don't run bundle:cms — another worker owns it.
PM commands run inside ProjectManager/. tsc + npm test + opennext build, NOT while
dev (3601) is up.

# Note to the next Meeseeks (pm-roles)

Bugs section is CLEAR (the 2026-06-23 P2 invite-revoke bug is DONE). Slices 1–7
all DONE — the core goal is complete end-to-end. Gates this run: tsc 0, 150 node
tests, opennext build green.

This run added invite revoke: `deleteInvite` (`lib/invite/invite.ts`),
`DELETE /api/invite/[id]` (gated `canUserInvite`), client
`invite/pending-invites.tsx` with an in-app confirm modal, EN/FI/ET
`invites.revoke.*` + `invites.pending.actions`, regression test
`lib/invite/revoke-bug-2026-06-23.test.ts`.

PICK NEXT — no urgent work; candidate polish (none blocking):
1. **Promote the overlay-dialog/confirm-modal to components/ui.** It's now copy-
   pasted in THREE places: tags-manager (`ConfirmDeleteModal`), users-manager
   (`ConfirmRemoveModal`), and now invite/pending-invites. The "3rd copy →
   promote it" threshold from prior caveats is met. One small `<ConfirmDialog>`
   (role=dialog aria-modal, bg-black/50 overlay, stopPropagation panel, danger
   confirm) + migrate all three callers. Pure UI; tsc+build gate.
2. **End-to-end Manager smoke (manual/browser at https://bizbee.localhost).** Still
   never run against live D1: create a tag → tag a Site → invite/assign a Manager
   with that country+tag → confirm `/sites` shows ONLY matching Sites. Also smoke
   the new revoke button on a real pending invite.
3. **Editor invite→assignment follow-up.** Editor reaches only ASSIGNED sites;
   verify accept path + per-Site assign UI list Editors correctly (still unverified
   end-to-end).

PARALLEL-SAFETY: stay OUT of CMS/ and don't run bundle:cms — another worker owns it.
PM commands run inside ProjectManager/. tsc + npm test + opennext build, NOT while
dev (3601) is up.

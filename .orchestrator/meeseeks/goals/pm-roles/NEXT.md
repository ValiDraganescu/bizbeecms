# Note to the next Meeseeks (pm-roles)

Bugs section is CLEAR. Slices 1–7 + polish + Editor follow-up + LIVE EMAIL all DONE;
core goal complete end-to-end. This run enabled **live invite email delivery** (code-
only): `send_email` binding (Mode B, no destination_address) in BOTH PM + CMS
wrangler.jsonc, FROM_ADDRESS → `noreply@bizbeecms.com` in both `send-invite.ts`,
regenerated both `worker-configuration.d.ts`. Gates: PM tsc 0, CMS tsc 0, PM 154 tests,
CMS 733 tests, PM + CMS opennext build green, deployer dry-run builds.

⚠️ USER ACTION REQUIRED before email actually flows: redeploy PM + redeploy a site to
ship the EMAIL binding, then send a real invite expecting `delivered: true`. A merge
alone does NOT enable delivery (the binding only attaches on deploy).

PICK NEXT — no urgent work; remaining candidates (none blocking):
1. **End-to-end Manager + Editor smoke (manual/browser at https://bizbee.localhost).**
   STILL never run against live D1. Create a tag → tag a Site → invite a Manager with
   that country+tag → `/sites` shows ONLY matching Sites. Then invite an Editor (no
   scope) → assign it to ONE Site → confirm `/sites` shows ONLY that Site. Eyeball the
   invite email actually arriving (now that delivery is live) + the ConfirmDialogs.
2. **Small UI/a11y polish on ConfirmDialog** (focus-trap / Escape-to-close). Only if a
   real browser review asks for it; YAGNI otherwise.
3. **`listAssignableUsers` loads ALL users + countries into memory** (ponytail-fine at
   PM scale). Push the country filter into SQL only if user counts explode.

PARALLEL-SAFETY: this run OWNED both PM + CMS (the email task spans both, intentional —
no other worker in CMS). Normally stay OUT of CMS/ and don't run bundle:cms. PM commands
run inside ProjectManager/, CMS inside CMS/. tsc + npm test + opennext build, NOT while
dev (3601) is up (it was DOWN this run).

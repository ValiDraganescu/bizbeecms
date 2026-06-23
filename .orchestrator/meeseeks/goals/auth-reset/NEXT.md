# Note to the next Meeseeks (auth-reset)

**auth-reset FULL SCOPE COMPLETE — PM P1–P5 + CMS C1–C5 all DONE.**
- PM half: password_resets table, /api/auth/forgot, /api/auth/reset, pages+login link,
  pure-logic tests.
- CMS half: password_reset table+migration 0012, /api/auth/forgot, /api/auth/reset,
  forgot/reset pages+login link, and C5 = reset-logic.test.ts + `bundle:cms` regen.
- C5 (final) shipped all CMS reset changes into the PM-deployable
  `ProjectManager/src/lib/deploy/cms-bundle.generated.js` via `npm run bundle:cms`.
- Gates all green both apps (tsc / node tests / opennext build).

**There is no queued next task — the whole password-reset feature (both apps) is delivered.**
If summoned again on this goal:
1. Re-read main/GOAL.md + this goal's GOAL.md and verify against the live app — the
   only meaningful work left would be an E2E browser smoke (request reset on
   bizbee.localhost / a deployed Site, click the emailed link, set a new password,
   confirm old session is killed) or a deploy of the regenerated CMS bundle.
2. If nothing reset-specific remains, flag in `result` that auth-reset looks fully
   delivered so the curator can archive this subgoal — don't invent busywork.

Reminders that still hold: ONE app per run; only ONE worker runs `bundle:cms`;
`lsof -ti:3601,3602` must be empty before any opennext build or bundle:cms.

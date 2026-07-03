# Note to the next Meeseeks (auth-reset)

**ALL CODE IS DONE AND SHIPPED.** Both apps' forgot/reset flows are complete, and
the BUG [P1] subject-prefix fix is in all four mails (PM+CMS × invite+reset). As of
2026-06-26 09:53 the `bundle:cms` regen loose end is **CLOSED** — the PM-deployable
`ProjectManager/src/lib/deploy/cms-bundle.generated.js` now carries the CMS
reset-subject change. **There is no codeable work left in this goal.**

**The ONLY remaining item is NOT codeable here — a live HITL verify gated on another
goal's deployer fix:**

1. **part (1) link host** — shared deployer `APP_ORIGIN` fix tracked in `sso`/`cms-mcp`
   (deployer `src/index.ts` ~520 sets APP_ORIGIN to workers.dev even with a custom
   domain). DO NOT fix APP_ORIGIN here. When it lands + a custom-domain site redeploys,
   BOTH the email link host AND the subject prefix go live together (the subject is
   derived from APP_ORIGIN, so it auto-activates — no code change in this goal).

2. **Live HITL verify, then flip BUG [P1] DONE** — once the deployer fix lands +
   redeploy: invite a user AND request a reset on a custom-domain site (e.g.
   restovista.com) in BOTH apps → confirm (a) email link host is the custom domain,
   (b) invite subject is `<domain>: You are invited to use BizBeeCMS`, (c) reset
   subject is `<domain>: Reset your password`. If all check out, flip BUG [P1] DONE.

**If you wake with nothing to do:** the bug is purely awaiting a cross-goal fix +
human verification. There is no productive code task in auth-reset right now — every
slice (PM P1–P5, CMS C1–C5, behavioral test harness, subject parity, bundle regen) is
DONE. Don't invent busywork; report that the goal is code-complete and blocked on the
deployer fix + HITL. (If you must do something, re-read main/GOAL.md for an adjacent
gap — but auth-reset itself is done.)

Gate every run: app tsc + node tests + opennext build, NOT while dev (3601/3602) up —
`lsof` first. NOTE: PM `tsc` currently reports errors in the deploy-log-stream goal's
in-flight dirty files (`deploy-events.ts`, `deploy-status-badge.tsx`) — those are NOT
auth-reset's and clear once that goal commits. ONE app per run.

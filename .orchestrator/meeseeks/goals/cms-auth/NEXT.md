# Note to the next Meeseeks (cms-auth)

NO open bugs. `password_reset` PRUNE LANDED this run (`pruneSpentResets` in
`lib/reset/reset.ts`, best-effort from `createPasswordReset`). All THREE auth-token
tables (`session`, `login_attempt`, `password_reset`) now self-prune — the
unbounded-growth track is CLOSED. Backlog has NO queued TODO — invent the next
slice (skill rule 3).

## CHECK `git status` FIRST
Tree was clean of CMS/PM source WIP this run (only goal-memory + two untracked
`.impeccable/` archive dirs + DEPLOY-ARCHITECTURE.md/SUBGOALS.md from another
worker — left untouched). If you see foreign WIP in `CMS/src` or
`ProjectManager/src`, stage ONLY your own files (no `git add -A`) and DON'T regen
cms-bundle (it'd bundle their WIP).

## DON'T re-chase these — they're already solved or non-problems:
- **Session-id rotation on role change = NOT NEEDED.** The guard resolves `role`
  LIVE every request (`guard.ts` `decide()` → `findUserById(session.userId).role`);
  the `session` row stores NO role. So a demote takes effect immediately with no
  rotation. `applyReset` + `deleteUser` already sweep sessions. Don't add rotation
  "for fixation" without a concrete fixation vector — there isn't one here.

## PICK NEXT — strongest candidates (in order):
1. **Slice-2 `@pm.sso` synthetic-email FOLLOW-UP.** ⚠️ TOUCHES PM
   (`ProjectManager/src` cms-validate/cms-sso-exchange to return the real verified
   email). Only pick when NO parallel worker is editing PM. Switch sso-callback's
   upsert to match/store the real email + backfill existing `<uuid>@pm.sso` rows.
   Until then SSO operators show as `<uuid>@pm.sso` in the user list (Slice 5).
2. **Live Google round-trip / per-Site client provisioning** — HITL.md (needs a
   real Google client). Don't pick unless paired with HITL.md.
3. **CSP / per-site isolation hardening** for AI-authored `script` artifacts (main
   GOAL.md notes "(later) CSP"). Cross-cutting — if it doesn't clearly belong to
   cms-auth's session/cookie boundary, flag the curator to carve its own track.

## Gotchas (still true)
- **node-test loadability:** a module that imports `next/headers` (e.g.
  `session-store.ts`) CANNOT be loaded under `node --test`. Put node-tested D1
  logic in a Db-port-only module (no `next/headers`). `lib/reset/reset.ts` IS
  node-loadable (relative imports + lazy `getDb`) — that's why `pruneSpentResets`
  could live there directly instead of a new module.
- All three prunes piggyback their write path (`createSession` /
  `recordFailure` / `createPasswordReset`); the CMS Worker has NO cron handler —
  don't add one.
- `login_attempt` is `kind`-namespaced (`'login'|'forgot'`). Store fns:
  `(email, now, kind='login', injectedDb?)` — kind arg 3, injectedDb arg 4.
- Guard resolves sessions LOCALLY (no PM forward); local users have no PM row.
- Google id_token JWK-RS256-verified; OAuth routes + login button read per-Site D1
  creds via `decideGoogleRoute(getGoogleClientConfig(), APP_ORIGIN).usable`.
- `CMS_AUTH_SECRET` + `APP_ORIGIN` stay env/deployer-injected.
- Gate (clean tree): CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` up) green; regen PM cms-bundle when a slice adds
  or changes worker-imported runtime code; EN/FI/ET for new strings.

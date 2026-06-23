# Note to the next Meeseeks (cms-auth)

NO open bugs. EXPIRED-SESSION PRUNE LANDED this run (new `db/session-prune.ts`
`pruneExpiredSessions`, called best-effort from `createSession`; bounds `session`
table growth — same class as the login_attempt prune). Backlog has NO queued
TODO — invent the next slice (skill rule 3).

## CHECK `git status` FIRST
This run another worker (ai-openrouter / curator) had UNCOMMITTED edits in
`DEPLOY-ARCHITECTURE.md` + `.orchestrator/meeseeks/goals/main/SUBGOALS.md` and
untracked `.impeccable/` archive dirs — I left ALL of them unstaged (not mine).
If you see foreign WIP in `CMS/src` or `ProjectManager/src`, stage ONLY your own
files (no `git add -A`) and DON'T regen cms-bundle (it'd bundle their WIP).

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
4. **Session-id rotation on privilege change** — `applyReset` already kills the
   user's sessions; consider rotating the session id on role change too (fixation
   defense). Small, CMS-only, node-testable.

## Gotchas (still true)
- **node-test loadability:** a module that imports `next/headers` (e.g.
  `session-store.ts`) CANNOT be loaded under `node --test`. Put node-tested D1
  logic in a Db-port-only module (no `next/headers`) — that's why the session
  prune is in `db/session-prune.ts`, not `session-store.ts`.
- `session` prune = `DELETE WHERE expires_at <= now` from `createSession`
  (try/catch, best-effort). `login_attempt` prune = inside `recordFailure`. Both
  piggyback the write path; the CMS Worker has NO cron handler — don't add one.
- `login_attempt` is `kind`-namespaced (`'login'|'forgot'`). Store fns:
  `(email, now, kind='login', injectedDb?)` — kind arg 3, injectedDb arg 4.
- Guard resolves sessions LOCALLY (no PM forward); local users have no PM row.
- Google id_token JWK-RS256-verified; OAuth routes + login button read per-Site D1
  creds via `decideGoogleRoute(getGoogleClientConfig(), APP_ORIGIN).usable`.
- `CMS_AUTH_SECRET` + `APP_ORIGIN` stay env/deployer-injected.
- Gate (clean tree): CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` up) green; regen PM cms-bundle when a slice adds
  or changes worker-imported runtime code; EN/FI/ET for new strings.

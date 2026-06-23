# Note to the next Meeseeks (cms-auth)

NO open bugs. `login_attempt` PRUNE LANDED this run (opportunistic
`DELETE WHERE created_at < windowStart(now)` inside `recordFailure`, wipes ALL
out-of-window rows any email/kind — the never-`clearFailures`-d `forgot` rows now
age out). Backlog has NO queued TODO — invent the next slice (skill rule 3).

## CHECK `git status` FIRST
This run the tree was clean of parallel CMS/PM WIP (only goal-memory + two
untracked `.impeccable/` archive dirs, left untouched). If a parallel worker has
uncommitted edits in `CMS/src` or `ProjectManager/src`, stage ONLY your own files
(no `git add -A`) and DON'T regen cms-bundle (it'd bundle their WIP).

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
- `login_attempt` is `kind`-namespaced (`'login'|'forgot'`). Store fns:
  `(email, now, kind='login', injectedDb?)` — kind arg 3, injectedDb arg 4.
  Don't cross-lock surfaces by reusing a kind. `/api/auth/reset` token-gated, NOT
  throttled.
- PRUNE lives in `recordFailure` (post-INSERT, deletes ALL aged rows). DON'T add a
  cron — the CMS Worker has no scheduled handler; the write-path piggyback is
  deliberate (ponytail comment names the cron upgrade path).
- Throttle keyed by lowercased email ONLY (no IP). MAX_ATTEMPTS=5 / WINDOW=15min.
  Non-enumerating: failures/requests recorded for unknown emails too.
- Login route order: throttle-check -> password verify -> recordFailure(bad) /
  clearFailures(ok) -> createSession. Forgot: throttle-check -> recordFailure(always)
  -> findUser -> mint/send. Both 429 with `Retry-After` (seconds).
- Guard resolves sessions LOCALLY (no PM forward); local users have no PM row.
- Google id_token JWK-RS256-verified; OAuth routes + login button read per-Site D1
  creds via `decideGoogleRoute(getGoogleClientConfig(), APP_ORIGIN).usable`.
- `CMS_AUTH_SECRET` + `APP_ORIGIN` stay env/deployer-injected.
- Gate (clean tree): CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` up) green; regen PM cms-bundle when a slice adds
  or changes worker-imported runtime code; EN/FI/ET for new strings.

# Note to the next Meeseeks (cms-auth)

NO open bugs. Brute-force protection on `/api/auth/login` LANDED this run (429 +
Retry-After, sliding-window D1 counter; see JOURNAL + CAVEATS). Backlog has NO
queued TODO — invent the next slice (skill rule 3).

## CHECK `git status` FIRST
This run the tree was clean (ai-openrouter WIP had been committed). If a parallel
worker has uncommitted edits in `CMS/src` or `ProjectManager/src`, stage ONLY your
own files (no `git add -A`) and DON'T regen cms-bundle (it'd bundle their WIP).

## PICK NEXT — strongest candidates (in order):
1. **Apply the throttle to `/api/auth/forgot` (+ reset).** CMS-only, no PM. The
   forgot-password endpoint is now the unthrottled enumeration/abuse surface (login
   is protected). REUSE `lib/auth/throttle-core.ts` + `db/login-attempt-store.ts`
   — don't fork. The store is currently EMAIL-ONLY; if you want a separate
   namespace for forgot-vs-login, add a `kind` column to `login_attempt` (migration
   0014) and thread it through the store. Cheapest path: share the same email key.
2. **Slice-2 `@pm.sso` synthetic-email FOLLOW-UP.** ⚠️ TOUCHES PM
   (`ProjectManager/src` cms-validate/cms-sso-exchange to return the real verified
   email). Only pick when NO parallel worker is editing PM. Switch sso-callback's
   upsert to match/store the real email + backfill existing `<uuid>@pm.sso` rows.
3. **Live Google round-trip / per-Site client provisioning** — HITL.md (needs a
   real Google client). Don't pick unless paired with HITL.md.

## Gotchas (still true)
- Throttle keyed by lowercased email ONLY (no IP). Non-enumerating: failures
  recorded for unknown/SSO-only emails too. MAX_ATTEMPTS=5 / WINDOW_MS=15min.
- Login route order: throttle-check -> password verify -> recordFailure(bad) /
  clearFailures(ok) -> createSession. 429 carries `Retry-After` (seconds).
- Logout uses `destroySession()` (D1 row delete + cookie clear); hard-nav re-gates.
- Google id_token is JWK-RS256-verified in the callback before claims; fail-closed.
- OAuth routes + login button both read per-Site D1 creds via
  `decideGoogleRoute(getGoogleClientConfig(), APP_ORIGIN).usable`. No `env.GOOGLE_CLIENT_*`.
- `CMS_AUTH_SECRET` + `APP_ORIGIN` stay env/deployer-injected (KEK + state-HMAC + origin).
- Gate (clean tree): CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` up) green; regen PM cms-bundle when a slice adds
  runtime worker code; EN/FI/ET for new strings.

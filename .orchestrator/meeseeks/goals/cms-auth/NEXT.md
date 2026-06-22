# Note to the next Meeseeks (cms-auth)

ALL planned slices (0,1,2,2b,3,4,5) are DONE. The BACKLOG ## Tasks list has no
open TODO and the ## Bugs section is empty. Don't re-litigate the four Slice-0
decisions (GOAL.md "Settled identity model").

## What Slice 2b just landed (all green — 733 tests, tsc + opennext build, cms-bundle regen)
- "Sign in with Google" (OAuth 2.0, own client), net-new. Pure
  `lib/auth/google-core.ts` (buildGoogleAuthUrl / signed-state CSRF / id_token
  verified-email extraction / no-self-signup `decideGoogleSignIn`) + routes
  `app/api/auth/google/{start,callback}`. Login-page button (shown when
  GOOGLE_CLIENT_ID + APP_ORIGIN set) + `?error=` banner. EN/FI/ET `login.google*`.
  Deployer injects GOOGLE_CLIENT_ID/SECRET. See CAVEATS "GOOGLE SIGN-IN LANDED".
- HITL.md ## Open has the P1: provision the Google OAuth client + set the redirect
  URI `<APP_ORIGIN>/api/auth/google/callback` + deployer secrets + live round-trip.

## PICK NEXT (no queued task — invent the next valuable slice toward GOAL.md)
The goal is "good" per its checklist EXCEPT a couple of real follow-ups worth doing:
1. **Backfill the synthetic `<uuid>@pm.sso` email (Slice-2 FOLLOW-UP).** When PM's
   cms-validate / cms-sso-exchange is extended to return the operator's REAL
   verified email, switch `sso-callback` to match/store it + backfill existing
   `@pm.sso` rows so the user list shows real emails. This touches PM (a parallel
   worker) — coordinate or flag as cross-track.
2. **Logout for CMS-local users.** `destroySession()` exists in session-store but
   there's no `POST /api/auth/logout` route or a sign-out control in the admin
   chrome. Small, high-value, fully offline + testable. Good first pick.
3. **Self-serve "request access" / forgot-password.** Lower priority; password
   reset needs the Email binding (still commented until a verified sender domain).

RECOMMEND #2 (logout) — smallest, no external deps, closes an obvious UX gap.

## Heads-up / gotchas (still true)
- Don't reintroduce the PM forward in the guard — local/Google users have no PM row.
- Google redirect_uri MUST be APP_ORIGIN-based + match the registered client; NO
  self-signup (user-or-invite only). See CAVEATS "GOOGLE SIGN-IN LANDED".
- CF Email binding uses WORKERS shape `{to, from:{email,name}, subject, text}`;
  commented in wrangler until a verified sender domain exists (degrades to logging).
- Gate every slice: CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` is up) + EN/FI/ET parity + regen cms-bundle from
  ProjectManager (`npm run bundle:cms`) once a slice adds runtime routes.

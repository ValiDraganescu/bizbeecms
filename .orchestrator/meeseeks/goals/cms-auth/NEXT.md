# Note to the next Meeseeks (cms-auth)

NO open bugs. The active work is the **GOOGLE-CLIENT REWORK** (per-Site
customer-owned OAuth client) — see BACKLOG "## GOOGLE-CLIENT REWORK". 4 TODOs;
**TODO #1 (storage UI + encrypted D1) is now DONE** (JOURNAL 2026-06-23 16:46).

## PICK NEXT — REWORK TODO #2 (the natural next slice)
**"Source the OAuth routes from per-Site creds instead of `env`."** Rewrite
`app/api/auth/google/{start,callback}/route.ts` to read clientId/clientSecret from
the CMS D1 config instead of `env.GOOGLE_CLIENT_ID/SECRET`:
- The plumbing is READY: `db/google-client-store.ts` already has
  `getGoogleClientConfig()` (id) + `getDecryptedClientSecret(kek)` (secret,
  returns null on decrypt-fail — treat as not-configured, NEVER 500). KEK =
  `CMS_AUTH_SECRET` from env (the route reads env for the KEK only).
- Keep `redirect_uri = <APP_ORIGIN>/api/auth/google/callback` (APP_ORIGIN stays
  deployer-injected — it's the site origin, not a secret).
- No client configured → `start` returns the SAME `/admin` fallback it already has
  (no consent). `google-core.ts` is UNCHANGED (already takes clientId/redirectUri
  as params) — its unit tests stay green. Add a pure helper deciding
  configured/redirectUri from (config, APP_ORIGIN) + a fake-env/fake-db test.

Then TODO #3 (hide the login-page button unless THIS site has a client configured
— switch the signal from env to the per-Site config) and TODO #4 (rip out the
shared deployer-injected `GOOGLE_CLIENT_ID/SECRET` from deployer + wrangler +
any leftover `env.GOOGLE_CLIENT_*` reads; update the "GOOGLE SIGN-IN LANDED"
caveat's shared-client bullet).

## Heads-up / gotchas (still true)
- Secret-box KEK is the EXISTING `CMS_AUTH_SECRET` — don't provision a new secret.
- `isGoogleConfigured` needs BOTH id AND secret; half-config = button hidden.
- The settings route is `requireUserManager` (Manager+). GET never returns the secret.
- Gate every slice: CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` is up) + EN/FI/ET parity + regen cms-bundle
  (`npm run bundle:cms` in ProjectManager) once a slice changes a runtime route.
- Don't reintroduce the PM forward in the guard; Google redirect_uri MUST be
  APP_ORIGIN-based + match the (customer's) registered client; NO self-signup.

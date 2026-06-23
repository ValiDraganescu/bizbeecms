# Note to the next Meeseeks (cms-auth)

NO open bugs. GOOGLE-CLIENT REWORK fully closed. JWK RS256 id_token verification
landed (2026-06-23 17:07 — the Google sign-in path is now signature-verified, not
just claim-checked). Backlog has NO queued TODO — invent the next slice (skill rule 3).

## PICK NEXT — strongest candidates (in order):
1. **Slice-2 `@pm.sso` synthetic-email FOLLOW-UP.** SSO operators still show in the
   CMS user list as `<uuid>@pm.sso` because PM's cms-validate returns userId but NOT
   the email. Extend PM's cms-validate (or cms-sso-exchange) to return the real
   verified email, switch `sso-callback`'s upsert to match/store it, backfill existing
   `@pm.sso` rows. ⚠️ TOUCHES PM (`ProjectManager/src`). As of 2026-06-23 a PARALLEL
   ai-openrouter Meeseeks was actively editing PM (site-form/deploy/site.ts +
   openrouter-key route + mint-on-deploy). CHECK `git status` first — if PM is still
   being edited by another worker, DON'T pick this (collision risk); do a CMS-only
   slice instead and flag it.
2. **Live Google round-trip / per-Site client provisioning** — HITL (needs a real
   Google client). Don't pick unless paired with HITL.md.
3. **Password-reset for CMS-local users** (if not already done — check JOURNAL; there
   are reset-route tests in the suite, so it may exist). A "forgot password" email
   flow mirroring the invite token mechanism.

## Gotchas (still true)
- Google id_token is now JWK-RS256-verified in the callback BEFORE claims are read
  (`verifyIdTokenSignature` in google-core.ts, `fetchGoogleJwks` cache in the route).
  Fail-closed → `?error=google`. Don't weaken it.
- OAuth routes + login button BOTH read per-Site D1 creds via
  `decideGoogleRoute(getGoogleClientConfig(), APP_ORIGIN).usable`. No `env.GOOGLE_CLIENT_*`.
- `CMS_AUTH_SECRET` + `APP_ORIGIN` stay env/deployer-injected (KEK + state-HMAC + origin).
- Gate every slice: CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` up) green; regen PM cms-bundle (`npm run bundle:cms`)
  when a slice adds runtime worker code; EN/FI/ET for new strings.
- WebCrypto `verify`/`sign` want ArrayBuffer-backed BufferSource — `.slice().buffer` the
  Uint8Arrays first or tsc flags `Uint8Array<ArrayBufferLike>`.

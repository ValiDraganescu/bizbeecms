# Note to the next Meeseeks (cms-auth)

NO open bugs. The **GOOGLE-CLIENT REWORK is FULLY CLOSED** (#4 landed 2026-06-23
17:01 — the shared deployer-injected client is gone; grep confirms zero
`GOOGLE_CLIENT_*` in deployer/src + CMS/src + wrangler). **The backlog now has NO
queued TODO** — invent the next valuable cms-auth slice per the skill's rule 3.

## PICK NEXT — invent a slice. Strongest candidates (in order):
1. **Slice-2 `@pm.sso` synthetic-email FOLLOW-UP.** SSO operators show in the CMS
   user list as `<uuid>@pm.sso` because PM's cms-validate returns userId but NOT the
   email. Extend PM's cms-validate (or cms-sso-exchange) to return the real verified
   email, switch `sso-callback`'s upsert to match/store it, and backfill existing
   `@pm.sso` rows. CAVEAT: touches the PM app (a parallel worker may own it) — check
   `git status`/coordinate before editing ProjectManager/src.
2. **JWK signature verification of the Google id_token** (hardening). Today
   `verifiedEmailFromIdToken` decodes but does NOT JWK-verify the signature (provenance
   = the TLS direct token exchange). Add fetch-of-Google-JWKS + RS256 verify as
   defense-in-depth. Pure-testable with a fixed JWK + token fixture.
3. **Live Google round-trip / per-Site client provisioning** — this is HITL (needs a
   real Google client), not codeable here. Don't pick unless paired with HITL.

## Gotchas (still true)
- OAuth routes + login button BOTH read per-Site D1 creds via
  `decideGoogleRoute(getGoogleClientConfig(), APP_ORIGIN).usable`. Don't reintroduce
  `env.GOOGLE_CLIENT_*` anywhere.
- `CMS_AUTH_SECRET` + `APP_ORIGIN` stay env/deployer-injected (KEK + state-HMAC + the
  site's own origin — not Google creds). Keep them.
- Gate every slice: CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` up) green; regen PM cms-bundle (`npm run bundle:cms`
  in ProjectManager) when a slice adds runtime worker code; EN/FI/ET for new strings.
- Deployer has NO local TypeScript — gate it with `cd deployer` transpile/syntax check,
  not `tsc` (there's no tsc binary in that package).

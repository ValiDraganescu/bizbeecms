# Note to the next Meeseeks (cms-auth)

NO open bugs. Active work is the **GOOGLE-CLIENT REWORK** (per-Site customer-owned
OAuth client). Progress: TODO #1 (storage UI + encrypted D1) DONE; **TODO #2
(routes source per-Site creds) is now DONE** (JOURNAL 2026-06-23 16:52). Two left.

## PICK NEXT — REWORK TODO #3 (the natural next slice)
**"Hide the Google button unless THIS Site has a client configured."** The login
page currently shows the button when `GOOGLE_CLIENT_ID` + `APP_ORIGIN` ENV are set.
Switch the visibility signal to the per-Site D1 config:
- Read it via `getGoogleClientConfig()` + `isGoogleConfigured(config)` (already in
  `db/google-client-store.ts` / `lib/auth/google-config.ts`). No config → no button.
- Find where the login page computes Google-button visibility today (grep
  `GOOGLE_CLIENT_ID` in `CMS/src/app/admin/layout.tsx` + the login page/component +
  any `lib/auth/login-*` helper). Replace the env read with the config read; keep
  `APP_ORIGIN` as part of "usable" if you want (decideGoogleRoute already encodes
  that — consider reusing `decideGoogleRoute(...).usable` as THE single signal).
- EN/FI/ET keys already exist from Slice 2b — no new strings. Add a pure visibility
  helper test (configured→show, half/empty→hide).

Then TODO #4: rip out the shared deployer-injected `GOOGLE_CLIENT_ID/SECRET` from
`deployer/src/index.ts` (Env type, container env, the two `--var` lines ~517/730),
`CMS/wrangler.jsonc` placeholders (~72-73), and any leftover `env.GOOGLE_CLIENT_*`
reads. Leave `APP_ORIGIN` + `CMS_AUTH_SECRET` intact. Update the CAVEATS "GOOGLE
SIGN-IN LANDED" last bullet (still describes the shared-client model).

## Gotchas (still true)
- Routes already use D1 creds now — DON'T reintroduce `env.GOOGLE_CLIENT_*` in them.
- `CMS_AUTH_SECRET` stays in env (KEK + state-HMAC, not a Google cred).
- Gate every slice: CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` is up) + EN/FI/ET parity + regen cms-bundle
  (`npm run bundle:cms` in ProjectManager) once a slice changes a runtime route/page.
- Live Google round-trip needs a real per-Site client → HITL, not codeable here.

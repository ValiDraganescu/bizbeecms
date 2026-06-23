# Note to the next Meeseeks (cms-auth)

NO open bugs. Active work is the **GOOGLE-CLIENT REWORK** (per-Site customer-owned
OAuth client). Progress: TODO #1 (storage UI + encrypted D1) DONE, #2 (routes source
per-Site creds) DONE, **#3 (login button gated on per-Site config) now DONE**
(JOURNAL 2026-06-23 16:57). **ONE left — #4, the cleanup.**

## PICK NEXT — REWORK TODO #4 (the LAST rework slice, then this rework is closed)
**"Rip out the shared deployer-injected Google client."** Nothing reads
`env.GOOGLE_CLIENT_*` anymore at the app layer (routes use D1 since #2, the login
layout uses D1 since #3). Now delete the dead shared injection:
- `deployer/src/index.ts` — remove `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` from the
  `Env` type, the container env block, and the two `--var` lines (grep them, ~517/730).
- `CMS/wrangler.jsonc` — remove the `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  placeholders (~72-73).
- grep `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` across CMS/src + deployer/src to
  confirm ZERO app reads remain (only the now-removed deployer/wrangler lines).
- Leave `APP_ORIGIN` + `CMS_AUTH_SECRET` intact (still needed).
- Update the CAVEATS "GOOGLE SIGN-IN LANDED (Slice 2b)" last bullet — it still
  describes the SHARED-client model (`GOOGLE_CLIENT_ID/SECRET` deployer vars). Rewrite
  it to the per-Site customer-client model.
- Gate: deployer `tsc` (cd deployer) + CMS `npm test` + `npx tsc --noEmit` + `npx
  opennextjs-cloudflare build` (NEVER while `npm run dev` up) green; regen PM
  cms-bundle (`npm run bundle:cms` in ProjectManager). No new i18n.

After #4 the whole GOOGLE-CLIENT REWORK is done — the goal then has no queued TODOs;
invent the next valuable cms-auth slice (per the skill's rule 3). Candidates: the
Slice-2 `@pm.sso` synthetic-email FOLLOW-UP (have PM cms-validate return the real
verified email + backfill rows — needs touching PM), or JWK signature verification
of the Google id_token (hardening, see Slice-2b caveat).

## Gotchas (still true)
- Routes + login button BOTH use D1 creds now via `decideGoogleRoute(...).usable` —
  DON'T reintroduce `env.GOOGLE_CLIENT_*` anywhere in the app.
- `CMS_AUTH_SECRET` stays in env (KEK + state-HMAC, not a Google cred).
- Live Google round-trip needs a real per-Site client → HITL, not codeable here.

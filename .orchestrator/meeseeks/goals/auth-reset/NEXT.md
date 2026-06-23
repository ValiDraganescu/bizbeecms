# Note to the next Meeseeks (auth-reset)

P1–P4 DONE. PM reset flow is now FULLY WIRED end-to-end (backend + UI):
- table+migration (P1), `POST /api/auth/forgot` (P2), `POST /api/auth/reset` (P3),
- pages: `app/(auth)/forgot/{page,forgot-form}.tsx`,
  `app/(auth)/reset/[token]/{page,reset-form}.tsx`, "Forgot password?" link on
  the login form (P4). Strings auth.login.forgotPassword + auth.forgot.* +
  auth.reset.* live in EN/FI/ET.

**Take P5 — PM reset PURE-LOGIC tests.** Most P3/P2 logic is ALREADY covered by
`lib/reset/forgot-route.test.ts` (enumeration-safe body, mint/send swallow, token
shape/TTL, i18n parity) and `lib/reset/reset-route.test.ts` (classify, `<=` expiry
boundary, isNull single-use guard, hash+session-invalidate ordering, generic-error/
no-reason-leak, min-length, i18n parity). Before writing new tests, read those two
files — P5 may be largely satisfied. If gaps remain (e.g. a focused "second use
rejected" or explicit "hit body === miss body deep-equal" assertion not already
present), add them in the same dependency-free style. Tests use SOURCE-TEXT
assertions because the `@/` alias isn't node-resolvable — match that pattern.

After P5, PM is done — move to CMS (C1–C5), mirroring P1–P5 under `CMS/src/`.

Reminders: PM only this run if you do P5 (`ProjectManager/`, never `CMS/`, never
`bundle:cms`). Gate: tsc + `npm test` + opennext build; NEVER while dev is up —
`lsof -ti:3601,3602` first.

# Note to the next Meeseeks (cms-auth)

Slice 0 (identity model) is DONE and recorded — see GOAL.md "Settled identity
model" + the fixed-decisions block in CAVEATS.md. Do NOT re-litigate those four
decisions; build on them.

PICK NEXT: **Slice 1 — CMS user + session schema + password auth (mirror PM, no
countries).** This is the first CODE slice. Concretely:
- Add to `CMS/src/db/schema.ts`: `users` (id, email UNIQUE, passwordHash NULLABLE
  for SSO-only users, role TEXT default 'Editor', createdAt) + a session store.
  Per Slice 0 there's ONE session notion on the CMS host. Mirror PM's KV session
  (`ProjectManager/src/lib/auth/session.ts`) — KV is simplest and matches PM.
- Port `ProjectManager/src/lib/auth/password.ts` (PBKDF2 **100k cap** — exceeding
  throws at RUNTIME ONLY on Workers, memory `pm-workers-pbkdf2-100k-cap`) and
  `session.ts` into the CMS, DROP all country code.
- Add a Drizzle migration. CONFIRM the deployer applies CMS migrations per-Site at
  deploy (check the deployer Worker / build-cms-bundle) — note in JOURNAL if it
  doesn't; that's a follow-up.
- Node test the password hash/verify round-trip + session create/read. NO UI yet.
- DON'T rewire sso-callback yet — that's the Slice 1/2 boundary noted in CAVEATS;
  but be aware Slice 2 must change the cookie VALUE from PM-sid to a CMS-local
  session id and make the guard resolve locally.
- Gate: CMS `tsc` + `npx opennextjs-cloudflare build` green (NEVER run build while
  `npm run dev` is up). Then regen PM `cms-bundle`. EN/FI/ET only matters once
  there are user-facing strings (Slice 2+), so Slice 1 is string-free.

# Journal — cms-auth
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 12:01 — Slice 0: settle the identity model (design + the one fork)
- **Status:** DONE
- **What I did:** Resolved the central design fork (the thing every later slice
  sits on) and wrote it down — no runtime code, design-only as the slice spec said.
  Decisions: (1) ONE unified CMS `users` table; PM-SSO login AUTO-PROVISIONS a row
  (match by verified email, role=Admin per the USER "PM-with-site-access=Admin"
  rule, passwordHash=NULL for SSO-only) — no parallel operator path. (2) ONE
  session cookie, name kept `bizbee_session` (different host than PM, no real
  collision) — but the cookie's VALUE meaning changes: today sso-callback stores
  PM's sid and the guard forwards it to PM cms-validate every request; after Slice
  1 the cookie holds a CMS-LOCAL session id and the guard resolves locally, so
  Slice 1/2 must rewrite sso-callback (nonce-exchange → upsert CMS user → mint
  local session) and cms-validate becomes the SSO handshake only. (3) No local
  first-registrant SuperAdmin bootstrap — first CMS user = first PM operator via
  SSO (auto-provisioned Admin); uninvited email/Google with no matching row =
  rejected (no self-signup). (4) Role set mirrors pm-roles exactly:
  SuperAdmin|Admin|Manager|Editor + canRemoveUser hierarchy, country/tag scope
  dropped. Recorded in GOAL.md ("Settled identity model" section) + CAVEATS.md
  (fixed-decisions block) + this entry.
- **Verified:** Confirmed against code, not assumption: `sso-callback/route.ts`
  sets `bizbee_session` = PM sid; `guard-core.ts` `SESSION_COOKIE="bizbee_session"`
  and forwards the cookie to PM cms-validate; `admin/layout.tsx` does the signed-out
  PM redirect this goal replaces; `ProjectManager/src/lib/roles.test.ts` pins the
  4-role union (SuperAdmin|Admin|Manager|Editor, no SiteManager). No build/tsc run
  — this slice touches no CMS source (doc-only), so the gate is N/A this run.
- **Files:** GOAL.md, CAVEATS.md, BACKLOG.md (Slice 0 → DONE), JOURNAL.md, NEXT.md.

## 2026-06-22 12:46 — Slice 1: CMS user + session schema + password auth (mirror PM, no countries)
- **Status:** DONE
- **What I did:** First CODE slice. Gave the CMS its own local-user + session
  layer, mirroring PM's mechanics, dropping ALL country scope.
  - `CMS/src/lib/auth/password.ts` — PBKDF2-100k hashing ported VERBATIM from
    `ProjectManager/src/lib/auth/password.ts` (pure, node-loadable, no `@/` / no
    CF binding). Added `MIN_PASSWORD_LENGTH=10` + `isPasswordLongEnough` (PM's
    10-char floor) so the rule lives next to the primitive for Slice 2/4.
  - `CMS/src/lib/auth/session-core.ts` — PURE session logic (newSessionId 64-hex,
    buildSession, isSessionValid, `SESSION_COOKIE="bizbee_session"`, 7-day TTL).
    Node-testable; CF/cookie-bound half kept separate.
  - `CMS/src/db/schema.ts` — added `user` (id, email UNIQUE, passwordHash
    NULLABLE for SSO/Google-only, role TEXT default 'Editor', createdAt) +
    `session` (id, userId, createdAt, expiresAt; user idx) + `CmsRole` type +
    User/Session/New* type exports.
  - `CMS/src/db/user-store.ts` — CF-coupled (Db port): normalizeEmail,
    findUserByEmail/ById, createUser. Mirrors api-key-store; goes through
    `getDb()` so the sole-reader guard stays green (never touches `env.DB`).
  - `CMS/src/db/session-store.ts` — CF+cookie-coupled: createSession (insert row
    + set cookie), getSessionId, getSession (reads D1, rejects+sweeps expired),
    destroySession (delete row + clear cookie).
  - `CMS/migrations/0009_motionless_night_thrasher.sql` — Drizzle migration for
    both tables (via `npm run db:generate`).
  - Tests: `scripts/password.test.mjs` (round-trip + the 100k-iterations
    assertion that fails-in-CI if someone bumps above the Workers cap) +
    `scripts/session-core.test.mjs` (id/build/expiry).
- **KEY DECISION — session store is D1, NOT KV.** PM uses a KV `SESSIONS`
  binding, but the CMS Worker's `wrangler.jsonc` has NO KV binding (only DB, AI,
  MEDIA, ASSETS). Adding KV would be a new deployer-wiring sub-task; the deployer
  ALREADY provisions + migrates D1 per-Site. So sessions live in a D1 `session`
  table — one less binding to wire, the DB is already the Site boundary. D1 has
  no auto-TTL so getSession() rejects + opportunistically deletes expired rows.
- **Verified:**
  - CMS `npx tsc --noEmit` → exit 0.
  - `npm test` → 526/526 green (was 505; +21 from my two new test files), incl.
    the sole-reader guard (my stores use getDb(), no stray env.DB) and
    schema-migration test (4/4).
  - `npx opennextjs-cloudflare build` (the deploy gate) → "OpenNext build
    complete" (ran with no dev server up, per CAVEAT).
  - CONFIRMED the deployer applies CMS migrations per-Site:
    `deployer/src/index.ts:639` runs `npx wrangler d1 migrations apply DB
    --remote` over `migrations/` (migrations_dir in wrangler.jsonc) at every
    deploy — so 0009 auto-applies. No follow-up needed there.
- **DID NOT regen PM cms-bundle (deliberate).** `bundle:cms` bundles
  `CMS/.open-next/worker.js` (runtime worker), NOT migrations. Slice 1 adds no
  new route/UI imported by a worker entrypoint, so the runtime bundle is
  functionally unchanged; regenerating now only churns `builtAt`. PM's
  `predeploy` runs `bundle:cms` automatically and will pick these files up once
  Slice 2 imports them into a login route. (Also honored the task's "don't run
  bundle:cms unless your slice needs it" + stay-out-of-ProjectManager.)
- **Files:** CMS/src/lib/auth/password.ts, CMS/src/lib/auth/session-core.ts,
  CMS/src/db/schema.ts, CMS/src/db/user-store.ts, CMS/src/db/session-store.ts,
  CMS/migrations/0009_motionless_night_thrasher.sql,
  CMS/migrations/meta/_journal.json, CMS/migrations/meta/0009_snapshot.json,
  CMS/scripts/password.test.mjs, CMS/scripts/session-core.test.mjs.

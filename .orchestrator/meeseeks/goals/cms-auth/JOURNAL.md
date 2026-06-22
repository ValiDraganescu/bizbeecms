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

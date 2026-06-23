# Note to the next Meeseeks (cms-auth)

NO open bugs. Logout LANDED this run (POST /api/auth/logout + footer button +
EN/FI/ET). Backlog has NO queued TODO — invent the next slice (skill rule 3).

## ⚠️ CHECK `git status` FIRST — parallel ai-openrouter WIP may still be in the tree
As of 2026-06-23 the ai-openrouter worker had UNCOMMITTED edits here: modified
`CMS/src/lib/ports/ai.ts` (broken `@/db` import → 3 failing tests:
ai-port/openrouter-ai/ports-factory, NOT yours) + `settings-nav.tsx` + untracked
`openrouter-key` files. If those are STILL uncommitted: stage ONLY your own files
(no `git add -A`), don't regen cms-bundle, and don't pick a PM-touching slice. If
the tree is clean now, the full `npm test` + `opennext build` gate is back in play.

## PICK NEXT — strongest candidates (in order):
1. **Slice-2 `@pm.sso` synthetic-email FOLLOW-UP.** ⚠️ TOUCHES PM
   (`ProjectManager/src` cms-validate/cms-sso-exchange to return the real verified
   email). Only pick when NO parallel worker is editing PM. Switch sso-callback's
   upsert to match/store the real email + backfill existing `<uuid>@pm.sso` rows.
2. **Brute-force protection on `/api/auth/login`** (+ reset). CMS-only, no PM.
   No KV on the CMS Worker, so a D1 attempt-counter (per email+IP, short window) or
   a lib-level helper. Real security gap — login currently has zero rate limiting.
3. **Live Google round-trip / per-Site client provisioning** — HITL.md (needs a
   real Google client). Don't pick unless paired with HITL.md.

## Gotchas (still true)
- Logout uses `destroySession()` (D1 row delete + cookie clear); hard-nav re-gates.
- Google id_token is JWK-RS256-verified in the callback before claims; fail-closed.
- OAuth routes + login button both read per-Site D1 creds via
  `decideGoogleRoute(getGoogleClientConfig(), APP_ORIGIN).usable`. No `env.GOOGLE_CLIENT_*`.
- `CMS_AUTH_SECRET` + `APP_ORIGIN` stay env/deployer-injected (KEK + state-HMAC + origin).
- Gate (clean tree): CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` up) green; regen PM cms-bundle when a slice adds
  runtime worker code; EN/FI/ET for new strings.

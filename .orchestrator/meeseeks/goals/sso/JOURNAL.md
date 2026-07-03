# Journal — sso
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-03 10:48 — P1 redirect_uri_mismatch: verified fixed LIVE, bug closed
- **Status:** DONE
- **What I did:** Housekeeping + live verification, no code. Discovered the P1's codeable fix had
  already shipped via the archived `cms-mcp` track (`deployer/src/origin-core.ts` `chooseAppOrigin`,
  wired into `deployer/src/index.ts`; PM deploy route threads the primary custom domain). Verified it
  is LIVE on the affected site: `GET https://www.restovista.com/api/auth/google/start` returns 302 to
  Google with `redirect_uri=https://www.restovista.com/api/auth/google/callback` — the registered
  custom-domain URI, not workers.dev. Also confirmed apex `restovista.com` 301→www live (APP_ORIGIN
  uses the canonical www host per the caveat), and that start+callback both read the same `APP_ORIGIN`
  env var so they cannot diverge. Marked the bug DONE in BACKLOG with the evidence.
- **Verified:** live curl of the start route (redirect_uri host + params), live apex 301, code read of
  both google routes + origin-core. Could NOT verify the full consent→session round-trip (needs a
  human Google account) — that remains the existing HITL TODO.
- **Files:** .orchestrator/meeseeks/goals/sso/{BACKLOG,JOURNAL,CAVEATS,NEXT}.md (memory only)

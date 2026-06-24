# Note to the next Meeseeks (ai-widget-ux)

Chat EXPORT is DONE (2026-06-24). The shared `isPmSsoUser` predicate +
`requirePmSso`/`currentUserIsPmSso` server gate are BUILT (`CMS/src/lib/auth/pm-sso.ts`
+ `guard.ts`) — REUSE them, don't rebuild. See CAVEATS for the known `@pm.sso` backfill leak.

**The ONE remaining open TODO (last in BACKLOG):**
**In-chat system-prompt editor + versions — PM-SSO only.**
- New per-Site D1 table (id, name/label, prompt text, createdAt) + migration + gated
  `/api/chat/prompts` CRUD route. Gate with `requirePmSso` (already built).
- A NEW version SEEDS from the assembled default (`assembleSystemPrompt`; reuse the
  `GET /api/chat/debug` builder which already returns `systemPrompt`). The edited text IS
  the version (full prompt, not a layer).
- Selecting a version applies to the TESTER's SESSION ONLY: the widget sends a per-request
  `systemPromptOverride` on the chat POST; `POST /api/chat/route.ts` uses it INSTEAD of
  `assembleSystemPrompt` ONLY when present AND caller is PM-SSO (reuse `currentUserIsPmSso`);
  IGNORED for non-SSO. NEVER changes the site default real end-users get.
- Pure helpers (node-tested): validate-prompt-input + "effective prompt = override-if-present-
  and-sso else assembled" decision.
- UI: versions dropdown + edit/save/new/delete near the debug panel; PM-SSO only (the debug
  route already returns `isPmSso`).
- EN/FI/ET for all new strings. Read the CAVEATS block on this task before starting.

Gate (all green this run): CMS `npx tsc --noEmit` + `npm test` (848 pass) +
`npx opennextjs-cloudflare build` (dev OFF on :3601). Do NOT run `bundle:cms` — auto-regens on
PM deploy. `CMS/src/lib/chat/models.ts` is ai-openrouter's; tsc/build may transiently fail
mid-their-edit — re-run. `messages/{en,fi,et}.json` SHARED — stage only your keys (rebuild from
`git show HEAD:...` if a plain add would sweep their uncommitted keys).

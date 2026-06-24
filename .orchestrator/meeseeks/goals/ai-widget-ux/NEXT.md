# Note to the next Meeseeks (ai-widget-ux)

Tool-call PERSISTENCE is DONE (2026-06-24): tool cards round-trip through history, stored inside
the existing `chat_thread.messages` JSON (NO migration). `lib/chat/history.ts` `ThreadMessage` has
`tools?: StoredTool[]` + exported `sanitizeTools` (assistant-only, plain-objects, cap 50). `seed()`
restores them. Reloaded cards expand (input/output) just like live ones. See CAVEATS.

**Remaining open TODOs — both are PM-SSO debug tasks (the LAST two in BACKLOG):**
1. **Export chat as full model-payload JSON — PM-SSO only.** Gated `GET /api/chat/export` mirroring
   the existing `GET /api/chat/debug` route; widget downloads the JSON. Build the pure
   `isPmSsoUser(user)` predicate ONCE here (sso→true, google/local→false) + node test — the
   system-prompt task reuses it. Server-gate (403 non-SSO), AND hide the button for non-SSO.
2. **In-chat system-prompt editor + versions — PM-SSO only.** New D1 table + migration + gated
   `/api/chat/prompts` CRUD; a NEW version seeds from the assembled default (`assembleSystemPrompt`,
   reuse the debug builder); selecting a version applies to the TESTER's SESSION ONLY via a
   per-request `systemPromptOverride` on the chat POST (route uses it only when present AND caller is
   PM-SSO; IGNORED for non-SSO). Never changes the site default. Do the export task first (or build
   `isPmSsoUser` here) — they share it. Read the CAVEATS block on these two before starting.

Gotchas (all in CAVEATS):
- `CMS/messages/{en,fi,et}.json` SHARED with ai-openrouter — rebuild from `git show HEAD:...` + only
  your keys if a plain `git add` would sweep their uncommitted keys. Never `-A`.
- Do NOT run `bundle:cms` — auto-regens on PM deploy; captures other loops' uncommitted edits.
- `CMS/src/lib/chat/models.ts` is ai-openrouter's; don't touch it; tsc/build may transiently fail
  mid-their-edit — re-run.
- Gate: CMS `npx tsc --noEmit` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF on :3601).

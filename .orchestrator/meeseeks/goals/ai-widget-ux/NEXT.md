# Note to the next Meeseeks (ai-widget-ux)

The system-prompt versions **SERVER slice is DONE** (2026-06-24). Don't rebuild it.
Built this run:
- D1 table `prompt_version` + migration `CMS/migrations/0015_sleepy_mephisto.sql`.
- Store `CMS/src/db/prompt-version-store.ts` (`listPromptVersions`/`createPromptVersion`/`deletePromptVersion`).
- Pure `CMS/src/lib/chat/prompt-version.ts`: `validatePromptInput` (label ≤80, prompt ≤20000),
  `effectiveSystemPrompt({override,isPmSso,assembled})` — override wins ONLY when PM-SSO + non-empty.
- Gated CRUD `GET/POST/DELETE /api/chat/prompts` (`requirePmSso` on every verb).
- Chat route (`POST /api/chat/route.ts`) already reads `systemPromptOverride` from the body and applies
  it via the now-4-arg `withSystemPrompt` ONLY when `currentUserIsPmSso()`.

**THE ONE REMAINING TODO: the WIDGET UI slice (PM-SSO only).**
In/near `ChatDebugPanel` (already PM-SSO-gated; `GET /api/chat/debug` returns `isPmSso` AND
`systemPrompt`), add:
- A versions dropdown — fetch `GET /api/chat/prompts` → `{versions:[{id,label,prompt,createdAt}]}`.
- An edit textarea + save / new / delete buttons. **New** seeds the textarea from the assembled
  default (`systemPrompt` from `GET /api/chat/debug`); the operator edits, then POST `{label,prompt}`.
- Selecting a version must thread its `prompt` up to `chat-widget.tsx` so the chat POST sends
  `systemPromptOverride: <selected prompt>` (per-request, session-only). Clearing selection = no
  override (back to assembled default). Delete via `DELETE /api/chat/prompts?id=<id>`.
- EN/FI/ET for all new strings. No native confirm/dialog.

Gate (all green this run): CMS `npx tsc --noEmit` + `npm test` (855 pass) +
`npx opennextjs-cloudflare build` (dev OFF on :3601). Do NOT run `bundle:cms` — auto-regens on PM
deploy. `CMS/src/lib/chat/models.ts` is ai-openrouter's — tsc/build may transiently fail mid-their-
edit; re-run. `messages/{en,fi,et}.json` SHARED — stage ONLY your keys (rebuild from
`git show HEAD:...` if a plain add would sweep their uncommitted keys).

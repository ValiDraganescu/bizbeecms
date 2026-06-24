# Note to the next Meeseeks (ai-widget-ux)

Tool-card accordion is DONE (2026-06-24): native `<details>` card, name shows once, expands to
Input/Output `<pre>` blobs. Helper `lib/chat/tool-card.ts` (`toolSubject`/`toolSummary`/`formatBlob`).
`ToolResult` (client-sse.ts) now has `input?`/`output?`; `route.ts runToolsRound` frames
`{ ...data, input: call.args }`. i18n: `chat.tool.{failBadge,input,output}` (removed `ok`/`fail`).

**Best next pick — "Persist tool calls in chat history".** Do it WITH the accordion in mind:
- `chat-conversation.tsx` `seed()` (~line 141) still sets `tools: []`. History saves only
  `{role, content}` (`lib/chat/history.ts validateThreadInput` + `db/chat-history-store.ts`).
- Extend the saved transcript shape to round-trip each assistant turn's `tools: ToolResult[]` —
  and store the ENRICHED shape (incl. `input`/`output`) so reloaded cards expand too (see CAVEATS).
- Migration if a new column is needed. Pure validate/serialize round-trip node test (save→load→same).

Other open TODOs: the two PM-SSO debug tasks (export JSON, system-prompt editor) — build
`isPmSsoUser(user)` ONCE and share; read their CAVEATS block (server gate, override session-only).

Gotchas (all in CAVEATS):
- `CMS/messages/{en,fi,et}.json` is SHARED with ai-openrouter — stage ONLY your keys; rebuild from
  `git show HEAD:...` + your keys if a plain `git add` would sweep their uncommitted keys. Never `-A`.
- Do NOT run `bundle:cms` — auto-regens on PM deploy; would capture other loops' uncommitted edits.
- `CMS/src/lib/chat/models.ts` is ai-openrouter's; don't touch it; tsc/build may transiently fail
  mid-their-edit — re-run.
- Gate: CMS `npx tsc --noEmit` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF on :3601).

# Note to the next Meeseeks (ai-widget-ux)

Textarea + Enter-behaviour switch is DONE (2026-06-24): `lib/chat/enter-mode.ts` (+test) +
`<textarea rows={3}>` with `resize-y` + an "↵ Send"⇄"↵ Newline" toggle in `chat-conversation.tsx`,
mode persisted in localStorage `bizbee.chat.enterMode`.

Pick the top remaining TODO in BACKLOG.md. Good self-contained next ones:
- **"Persist the selected model across reloads"** — smallest. `chat-widget.tsx:38` `useState(DEFAULT_MODEL)`
  → init from localStorage, validate against catalog ids, fall back to default. Pure
  `resolveInitialModel(stored, catalogIds, default)` + node test. (Coordinate with ai-openrouter,
  which owns the catalog/model type.)
- **"Tool-call cards: stop repeating the name + accordion"** — bigger; touches SSE `tool` event +
  `ToolResult` to carry args/result. Coordinate with the tool-persistence task.

Gotchas (all in CAVEATS):
- `CMS/messages/{en,fi,et}.json` is SHARED with ai-openrouter — stage ONLY your keys (use a node
  script to add yours, then `git add` just those files). Never `git add -A`.
- Do NOT run `bundle:cms` — auto-regens on PM deploy; would capture other loops' uncommitted edits.
- `CMS/src/lib/chat/models.ts` shows as modified in the tree — that's ai-openrouter's in-flight work.
  Don't touch it. tsc/build may transiently fail mid-their-edit; re-run, it goes green.
- Gate: CMS `npx tsc --noEmit` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF on :3601).

# Note to the next Meeseeks (ai-widget-ux)

Unread badge is DONE (2026-06-24): `lib/chat/unread-badge.ts` (`nextUnread(current,{open,
replyFinished})`) + `chat-widget.tsx` (`unread` state set on the save effect's busy→idle finish
edge when `!open`; cleared by a `useEffect([open])`; danger dot on the launcher when `unread &&
!open`, `chat.widget.unread` aria/title in EN/FI/ET).

Remaining TODOs in BACKLOG.md — good next picks:
- **"Tool-call cards: stop repeating the name + accordion"** — `chat-conversation.tsx` `ToolCard`
  (~line 294) shows the tool name twice (fix `tool.ok`/`tool.err` strings + the
  `subject = component ?? page ?? target ?? name` dup). Then make each card a `<details>` accordion
  exposing input(args)/output(result) — needs the SSE `tool` event + `ToolResult` type (~line 24)
  to carry args + raw result; thread them through `addTool`. Coordinate with the persistence task
  so the STORED tool shape == the RENDERED one.
- **"Persist tool calls in chat history"** — extend `lib/chat/history.ts` `validateThreadInput` +
  `db/chat-history-store.ts` to round-trip each assistant turn's `tools: ToolResult[]`; `seed()`
  (~line 134) currently sets `tools: []`. Migration if a column is added. Do this WITH the accordion
  task so reloaded cards expand too.
- The two PM-SSO debug tasks (export JSON, system-prompt editor) — these ADD server routes + (for
  the editor) a D1 table/migration. Build `isPmSsoUser(user)` ONCE and share. Read the CAVEATS block
  on them first (server-side gate, override is session-only).

Gotchas (all in CAVEATS):
- `CMS/messages/{en,fi,et}.json` is SHARED with ai-openrouter — stage ONLY your keys; rebuild the
  file from `git show HEAD:...` + your keys, then `git add`. Never `git add -A`.
- Do NOT run `bundle:cms` — auto-regens on PM deploy; would capture other loops' uncommitted edits.
- `CMS/src/lib/chat/models.ts` is ai-openrouter's; shows modified in-tree. Don't touch it. tsc/build
  may transiently fail mid-their-edit; re-run.
- Gate: CMS `npx tsc --noEmit` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF on :3601).

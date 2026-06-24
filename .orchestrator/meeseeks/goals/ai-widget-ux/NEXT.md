# Note to the next Meeseeks (ai-widget-ux)

Model persistence is DONE (2026-06-24): `lib/chat/selected-model.ts`
(`resolveInitialModel` + `loadModel`/`saveModel`, localStorage `bizbee.chat.model`) +
`chat-widget.tsx` (`setModel` writes through; mount effect validates the stored id against
`/api/chat/models` and falls back to DEFAULT_MODEL if removed).

Remaining TODOs in BACKLOG.md — good next picks:
- **"Unread badge when minimized + new reply arrives"** — self-contained, pure
  badge-visibility helper (minimized, lastSeenMessageId, latestMessageId) + node test, state in
  `chat-widget.tsx`. Set on busy→idle edge while `!open`, clear on open. EN/FI/ET if an aria label
  is added. (The save effect at `chat-widget.tsx` ~line 117 already detects the busy→idle finish edge —
  reuse that signal.)
- **"Tool-call cards: stop repeating the name + accordion"** — bigger; threads SSE `tool` event +
  `ToolResult` to carry args/result through `chat-conversation.tsx`. Coordinate with the
  tool-persistence task (store the enriched shape so reloaded cards expand).
- The two PM-SSO debug tasks (export JSON, system-prompt editor) — these ADD server routes; build
  the `isPmSsoUser(user)` predicate ONCE and share. Read the CAVEATS block on them first.

Gotchas (all in CAVEATS):
- `CMS/messages/{en,fi,et}.json` is SHARED with ai-openrouter — stage ONLY your keys; rebuild the
  file from `git show HEAD:...` + your keys, then `git add`. Never `git add -A`.
- Do NOT run `bundle:cms` — auto-regens on PM deploy; would capture other loops' uncommitted edits.
- `CMS/src/lib/chat/models.ts` is ai-openrouter's; shows modified in-tree. Don't touch it. tsc/build
  may transiently fail mid-their-edit; re-run.
- Gate: CMS `npx tsc --noEmit` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF on :3601).

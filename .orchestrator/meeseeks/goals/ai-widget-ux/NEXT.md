# Note to the next Meeseeks (ai-widget-ux)

Resizable panel + preset sizes is DONE (2026-06-24): `lib/chat/panel-size.ts` (+test) +
native CSS `resize` + a default⇄half header toggle in `chat-widget.tsx`, size persisted in
localStorage `bizbee.chat.panelSize`, re-clamped to the viewport on mount/resize.

Pick the top remaining TODO in BACKLOG.md. The most self-contained next one is
**"Chat input → resizable 3-row textarea + Enter-behavior switch"** (`chat-conversation.tsx:236`):
swap the `<input>` for a `<textarea rows={3}>` with CSS `resize: vertical`, add an Enter-mode toggle,
pure `decideSendOnEnter(mode,{shift,meta,ctrl})` + node test, persist the mode in localStorage.

Gotchas this run hit (now in CAVEATS):
- `CMS/messages/{en,fi,et}.json` is SHARED with the concurrent ai-openrouter loop — stage ONLY your
  keys (drop theirs, add the file, restore theirs unstaged). Never `git add -A`.
- Do NOT run `bundle:cms` — it captures other loops' uncommitted CMS edits; the bundle auto-regens on
  PM deploy.
- Gate: CMS `npx tsc --noEmit` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF on :3601).

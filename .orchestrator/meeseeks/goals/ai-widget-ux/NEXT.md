# Note to the next Meeseeks (ai-widget-ux)

The system-prompt versions **UI slice is DONE** (2026-06-24) — the whole versions feature
(server + UI) and every bullet in this goal's GOAL.md "what good looks like" list is now shipped:
resizable panel + presets, textarea + Enter-mode switch, tool-card accordion, full transcript
(incl. tool calls) survives refresh, minimized unread badge, persisted model, PM-SSO export +
prompt-versions editor.

**The backlog has no queued TODO left — pick the next valuable widget-UX slice (never idle).**
Candidates, smallest-first, all client/UX-only (honour the client-only rule + CAVEATS):
- **Active-override clarity:** when a saved prompt version is active, show its label inline near the
  chat input (not just in the debug panel) so the operator always knows they're off-default. Small.
- **Versions UX polish:** the version select shows only labels; consider a tiny "applied" indicator
  + relative createdAt; allow renaming a version (currently only create/delete). Adds a PATCH route
  though → server work, exception to client-only like the rest of the prompt feature.
- **Keyboard a11y pass** on the widget header buttons + the versions section (focus ring, Esc to
  minimize, focus trap when open).
- **Scroll-to-bottom affordance** when the transcript is scrolled up and a new reply lands.

How to wire an override into the chat POST (already built this run, reuse it): `useChat` takes a 3rd
getter `getOverride`; the widget owns `promptOverride` state and the debug panel sets it via
`onOverrideChange`. The route gates it to PM-SSO server-side.

GATES (all green this run): CMS `npx tsc --noEmit` + `npm test` (856 pass) +
`npx opennextjs-cloudflare build` (dev OFF — port 3601 must be free; NEVER build while dev is up).
Do NOT run `bundle:cms` (auto-regens on PM deploy). `messages/{en,fi,et}.json` SHARED with
ai-openrouter — stage ONLY your keys (rebuild from `git show HEAD:...` if a plain add would sweep
their uncommitted keys). `lib/chat/models.ts` is ai-openrouter's — tsc/build may transiently fail
mid-their-edit; just re-run.

# Note to the next Meeseeks (ai-widget-ux)

Active-override clarity is **DONE** (2026-06-24): a saved prompt version now shows an inline
`warning-subtle` banner near the chat input ("Custom prompt: <label>" + "Use default" clear), so the
operator always knows they're off the assembled default — not just in the debug panel.

**No queued TODO — pick the next valuable widget-UX slice (never idle).** Remaining candidates from
the GOAL, smallest-first, all client/UX-only (honour CAVEATS):
- **Versions rename:** the version select only supports create/select/delete; add rename. Needs a
  PATCH on `/api/chat/prompts` → small server exception like the rest of the prompt feature.
- **Keyboard a11y pass** on the widget header buttons + the versions/editor section (focus ring,
  Esc to minimize when open, focus order). Pure client.
- **Scroll-to-bottom affordance** in the transcript: when scrolled up and a new reply lands, show a
  "jump to latest" pill. Lives in `chat-conversation.tsx`. Pure client.

How the override is wired (reuse, don't rebuild): `chat-widget.tsx` owns `promptOverride` +
`overrideLabel`, both set via `applyOverride(prompt,label)`; `ChatDebugPanel.onOverrideChange` is
`(prompt,label)`. `useChat`'s 3rd getter `() => promptOverride ?? undefined` sends it; route gates to
PM-SSO server-side, session-only, never a site default.

GATES (all green this run): CMS `npx tsc --noEmit` + `npm test` (856 pass) +
`npx opennextjs-cloudflare build` (dev OFF — port 3601 must be free; NEVER build while dev is up).
Do NOT run `bundle:cms` (auto-regens on PM deploy). `messages/{en,fi,et}.json` SHARED with
ai-openrouter — stage ONLY your keys (rebuild from `git show HEAD:...` if a plain add would sweep
their uncommitted keys). `lib/chat/models.ts` is ai-openrouter's — tsc/build may transiently fail
mid-their-edit; just re-run.

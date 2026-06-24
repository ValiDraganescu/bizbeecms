# Note to the next Meeseeks (ai-widget-ux)

Focus-trap + initial-focus is **DONE** (2026-06-24): pure `nextTabStop` in `lib/chat/focus-trap.ts`;
`chat-widget.tsx` panel is `aria-modal`+`tabIndex={-1}`, focuses the textarea on open, traps
Tab/Shift+Tab in the same `onKeyDown` that handles Esc. See CAVEATS for the `focusables()` collector
+ "nested overlay must stopPropagation its own Tab" rule.

**No queued TODO — pick the next valuable widget-UX slice (never idle).** Remaining candidate:
- **Versions rename** (the one named GOAL-ish slice left): the prompt-version `<select>` in
  `ChatDebugPanel` supports create/select/delete but not rename. Add a `PATCH /api/chat/prompts`
  (`requirePmSso`-gated; store `db/prompt-version-store.ts` + pure `lib/chat/prompt-version.ts`
  already exist — extend with an update + reuse `validatePromptInput`) and a rename control in the
  panel. PM-SSO-only, gated on the SERVER (403 + ignore for non-SSO). EN/FI/ET for new strings.
  This BREAKS the client-only rule on purpose (server tail) — same exception as export/versions.
- Or another pure client polish (e.g. copy-message-to-clipboard button on transcript turns).

GATES (all green this run): CMS `npx tsc --noEmit` + `npm test` (873 pass) +
`npx opennextjs-cloudflare build` (dev OFF — port 3601 must be free; NEVER build while dev is up).
Do NOT run `bundle:cms` (auto-regens on PM deploy). `messages/{en,fi,et}.json` SHARED with
ai-openrouter — if you add keys and the files are dirty, rebuild your locale from
`git show HEAD:CMS/messages/<loc>.json` + ONLY your keys before staging. `lib/chat/models.ts` is
ai-openrouter's — tsc/build may transiently fail mid-their-edit; just re-run.

# Note to the next Meeseeks (ai-widget-ux)

Keyboard a11y pass is **DONE** (2026-06-24): Esc minimizes the open panel (dialog `onKeyDown` in
`chat-widget.tsx`) and all widget buttons + the launcher have a `focus-visible` ring. See the new
CAVEAT — if you add an inner overlay that needs its own Esc, `stopPropagation` it so it doesn't
minimize the whole panel.

**No queued TODO — pick the next valuable widget-UX slice (never idle).** Candidates, client/UX-only,
smallest-first (honour CAVEATS):
- **Versions rename:** the prompt-version select only supports create/select/delete; add rename.
  Needs a PATCH on `/api/chat/prompts` → small server exception like the rest of the prompt feature
  (`requirePmSso`-gated; store + pure helpers already exist in `prompt-version.ts`). This is the one
  remaining named GOAL-ish slice with a server tail.
- **Focus-trap / initial-focus** in the open dialog: on open, move focus into the panel (e.g. the
  textarea) and keep Tab cycling within it while open. Pure client, builds on the a11y work just done.
- **Tool-card "show more" truncation** for very large input/output blobs (`formatBlob` already exists
  in `lib/chat/tool-card.ts`) — pure client polish.

GATES (all green this run): CMS `npx tsc --noEmit` + `npm test` (862 pass) +
`npx opennextjs-cloudflare build` (dev OFF — port 3601 must be free; NEVER build while dev is up).
Do NOT run `bundle:cms` (auto-regens on PM deploy). `messages/{en,fi,et}.json` SHARED with
ai-openrouter — this run added NO new strings (reused existing labels), so i18n wasn't touched; if
your slice adds keys and the files are dirty, rebuild your locale from
`git show HEAD:CMS/messages/<loc>.json` + ONLY your keys before staging.
`lib/chat/models.ts` is ai-openrouter's — tsc/build may transiently fail mid-their-edit; just re-run.

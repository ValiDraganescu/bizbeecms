# Note to the next Meeseeks (ai-widget-ux)

Tool-card "show more" truncation is **DONE** (2026-06-24): `blobView` in `lib/chat/tool-card.ts`
gives `{full, preview, hidden, truncated}`; `ToolBlob` toggles preview↔full with a focus-ring button.
EN/FI/ET `chat.tool.{showMore,showLess}` added.

**No queued TODO — pick the next valuable widget-UX slice (never idle).** Remaining candidates,
client/UX-only, smallest-first (honour CAVEATS):
- **Focus-trap / initial-focus** in the open dialog: on open, move focus into the panel (textarea)
  and keep Tab cycling within it while open. Pure client, builds on the Esc-to-minimize a11y work.
  Reuse the focus-visible ring idiom already in place.
- **Versions rename:** the prompt-version select only supports create/select/delete; add rename.
  Needs a `PATCH /api/chat/prompts` — small `requirePmSso`-gated server tail (store + pure helpers
  in `prompt-version.ts` already exist). The one remaining named GOAL-ish slice with a server tail.

GATES (all green this run): CMS `npx tsc --noEmit` + `npm test` (867 pass) +
`npx opennextjs-cloudflare build` (dev OFF — port 3601 must be free; NEVER build while dev is up).
Do NOT run `bundle:cms` (auto-regens on PM deploy). `messages/{en,fi,et}.json` SHARED with
ai-openrouter — they were CLEAN this run, so a plain add was safe; if dirty when you add keys,
rebuild your locale from `git show HEAD:CMS/messages/<loc>.json` + ONLY your keys before staging.
`lib/chat/models.ts` is ai-openrouter's — tsc/build may transiently fail mid-their-edit; just re-run.

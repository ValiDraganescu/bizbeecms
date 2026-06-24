# Note to the next Meeseeks (ai-widget-ux)

Scroll-to-bottom affordance is **DONE** (2026-06-24): the transcript now follows new content only
while parked at the bottom (`useEffect([messages])` gated by `isAtBottom` in
`lib/chat/scroll-anchor.ts`), and a centered "Jump to latest ↓" pill appears when scrolled up. See
the new CAVEAT about the flex chain — don't collapse the `min-h-0`/`flex-1` wrapper.

**No queued TODO — pick the next valuable widget-UX slice (never idle).** Remaining candidates from
the GOAL, smallest-first, all client/UX-only (honour CAVEATS):
- **Versions rename:** the version select only supports create/select/delete; add rename. Needs a
  PATCH on `/api/chat/prompts` → small server exception like the rest of the prompt feature
  (`requirePmSso`-gated; the store + pure helpers already exist in `prompt-version.ts`).
- **Keyboard a11y pass** on the widget header buttons + the versions/editor section (focus ring,
  Esc to minimize when open, focus order). Pure client. The new pill is a plain `<button>` (already
  keyboard-reachable) — no work needed there.

GATES (all green this run): CMS `npx tsc --noEmit` + `npm test` (862 pass) +
`npx opennextjs-cloudflare build` (dev OFF — port 3601 must be free; NEVER build while dev is up).
Do NOT run `bundle:cms` (auto-regens on PM deploy). `messages/{en,fi,et}.json` SHARED with
ai-openrouter — was CLEAN vs HEAD this run so a plain edit was safe; if it's dirty next time, rebuild
your locale from `git show HEAD:CMS/messages/<loc>.json` + ONLY your keys before staging.
`lib/chat/models.ts` is ai-openrouter's — tsc/build may transiently fail mid-their-edit; just re-run.

# Note to the next Meeseeks (ai-attachments)

## Status: ALL CODEABLE WORK IS DRAINED.

The 4-task backlog is done. Tasks 1-3 (helpers, UI picker+drop, inline-base64 threading) shipped.
Task 4 "Verify end-to-end" is DONE for its codeable part (2026-06-26): tsc clean, `npm test` 943/943,
`opennextjs-cloudflare build` green (dev OFF), cms-bundle regenerated, all behaviors confirmed wired in
source (gate, picker, drop-zone, modality plumbing, content-array validation, EN/FI/ET keys).

## The ONLY thing left is NON-CODEABLE — do NOT re-pick it as a coding task.
The LIVE vision round-trip: deploy a Site CMS, pick a keyed OpenRouter vision model, attach an image,
confirm the model RESPONDS about it; confirm a text-only model blocks non-text; confirm multiple files.
Needs deployed infra + a vision-capable API key the release manager/user owns. Impossible from this repo.

## If you genuinely must add value here, the real codeable slices (only when a need actually lands):
- **Widen `/api/assets` past images.** `ALLOWED_ASSET_TYPES`/`EXT_BY_TYPE` in `CMS/src/lib/render/asset.ts`
  only allow `image/*` → PDFs/audio/docs 400 today, so the `file`/`audio` modality gates (which already
  work in `acceptsFile`) can't upload. Widen the allowlist + `EXT_BY_TYPE` + the `validateAsset` test to
  unblock file/audio vision models. Images work end-to-end NOW; do this only when a file/audio model need arrives.
- **Persist attachment R2 keys in history.** `chat-widget.tsx` save effect + `/api/chat/history` store
  string content; the R2 keys aren't kept on the stored message, so transcripts don't re-render
  attachments after reload. Store keys alongside if you want re-render-on-reload. Low priority.

## Gate (always): CMS tsc + `npm test` + `npx opennextjs-cloudflare build` (dev OFF — first failure?
`rm -rf .next .open-next` and retry, it's the stale-`.next` gotcha) + regen
`ProjectManager/src/lib/deploy/cms-bundle.generated.js` (`cd ProjectManager && npm run bundle:cms`) + EN/FI/ET.

# Goal: ai-attachments
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Let CMS AI-assistant users **attach files** to a chat message — drag-and-drop onto the
input textarea AND a `+` picker button — gated to the **selected model's supported input
modalities**, with files stored in the site's existing R2 bucket and sent **inline (base64)**
to the model so any vision/file model works.

This builds on the assistant (archived `ai-assistant`), the OpenRouter provider + model
catalog (`ai-openrouter` — `architecture.input_modalities` per model), and the EXISTING
per-site media pipeline. Read those before starting.

## Settled decisions (USER 2026-06-24)
1. **Delivery = inline base64 to the model, R2 for the record.** Send each file inline in the
   OpenRouter chat request (OpenAI-compatible `image_url` data-URI / file content part) so any
   vision model works; ALSO persist it to R2 so the transcript/history can reference it.
2. **Modality-gated, block + explain.** The `+` button and drop-zone accept only modalities the
   SELECTED model supports (`input_modalities` from the catalog). An unsupported file is rejected
   with a clear reason ("this model is text-only" / "can't read PDFs"). No auto-switching.
3. **Input attachments only.** Rendering model-GENERATED images (output_modalities) is OUT of scope
   — a separate later feature.
4. **One or more files per message** where the model supports it. No hard count limit imposed by us
   beyond the existing per-file size cap (`MAX_ASSET_SIZE`); revisit if OpenRouter rejects large batches.

## What's ALREADY built (reuse — do NOT rebuild)
- **Per-site R2 bucket EXISTS.** The deployer creates `bizbeecms-cms-media-<slug>` per Site and binds
  it as `MEDIA` (`deployer/src/index.ts` ~707-723). NO deployer change, NO new bucket needed.
- **Upload route EXISTS.** `POST /api/assets` writes to `env.MEDIA`, `/media/<key>` streams it back,
  `DELETE /api/assets?key=` removes it, `MAX_ASSET_SIZE` caps size (see `CMS/src/app/api/assets/route.ts`
  + `components/media/media-gallery.tsx`). Reuse this for assistant attachments — don't fork a parallel
  uploader.
- R2 facts (researched 2026-06-24): bucket names are **per-account unique (NOT global)**, lowercase/
  digits/hyphens, 3–63 chars; default **1,000 buckets/account** (raisable). The `bizbeecms-cms-media-<slug>`
  scheme already conforms and is collision-safe.

## What "good" looks like
- Drag a file onto the textarea OR click `+` → it uploads (existing `/api/assets`) and shows as a
  removable chip on the pending message; multiple files supported.
- The `+`/drop-zone is **gated to the selected model's `input_modalities`**; dropping an unsupported
  type shows a clear, localized rejection and does not attach.
- On send, attachments go to OpenRouter **inline as base64 data-URIs** (correct OpenAI-compatible
  content-part shape) so vision models actually see them; the message also keeps the R2 key for history.
- Pure helpers (accept-this-file? from model modalities + mime; build the inline content part) are
  node-tested. Gate: CMS tsc + `npm test` + `npx opennextjs-cloudflare build` (dev OFF) + cms-bundle regen
  + EN/FI/ET for all new strings.

## Out of scope
- New buckets / deployer provisioning changes (the per-site bucket already exists).
- Output-modality rendering (generated images).
- A general file-manager — this is assistant-message attachments, reusing the media pipeline.

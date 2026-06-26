# Caveats — ai-attachments
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **DO NOT create a new bucket or touch the deployer.** Each Site ALREADY has its own R2 bucket
  `bizbeecms-cms-media-<slug>`, created by the deployer (`deployer/src/index.ts` ~707-723) and bound as
  `MEDIA`. There's also a working uploader: `POST /api/assets` (→ `env.MEDIA.put`), `/media/<key>` GET
  stream, `DELETE /api/assets?key=`, `MAX_ASSET_SIZE` cap. REUSE it; don't fork a parallel upload path.
- **OpenRouter chat takes files INLINE, not URLs.** Send images as OpenAI-compatible
  `{type:"image_url", image_url:{url:"data:<mime>;base64,..."}}` content parts. An R2 `/media/<key>` URL
  alone won't work for most vision models — base64 inline is the decided delivery (R2 is for the record).
- **Modality data comes from `ai-openrouter`.** Per-model `architecture.input_modalities` is parsed in
  `ai-openrouter`'s catalog work (`models.ts`). Gate the picker/drop-zone against the SELECTED model's
  modalities. If that field isn't on the model type yet, coordinate or read `architecture` here.
- **R2 facts (2026-06-24):** bucket names are per-account unique (NOT global), lowercase/digits/hyphens,
  3–63 chars; default 1,000 buckets/account (raisable). Existing naming already conforms.
- **The chat message content may be a STRING today.** Adding attachments makes it a content-ARRAY
  (text + file parts). Check the chat route + OpenRouter adapter don't assume string content and break.
- **`/api/assets` is IMAGE-ONLY today.** `validateAsset`/`ALLOWED_ASSET_TYPES` in `CMS/src/lib/render/asset.ts`
  only allow `image/{jpeg,png,webp,gif,svg+xml}`. So even though `acceptsFile` correctly gates a `file`
  modality (PDF/doc), the upload route will 400 it → the UI shows `chat.attach.uploadFailed`. Images work
  end-to-end NOW. To support PDFs/docs/audio for file/audio models, WIDEN `ALLOWED_ASSET_TYPES` + the
  `EXT_BY_TYPE` map first (and the `validateAsset` test). Out of scope for the picker task; do it when task 3
  or a file-model need arrives.
- **The widget owns the catalog for gating.** `chat-widget.tsx` now keeps `catalog` state (from
  `/api/chat/models` via `coerceCatalog`) and passes the SELECTED model's `inputModalities` to
  `ChatConversation` as the `inputModalities` prop. Any NEW chat surface must pass it too, else attachments
  default OFF (text-only). The full-page `/admin/chat` surface doesn't exist yet (only the widget renders
  ChatConversation today).

# Journal — ai-attachments
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-26 08:21 — Tracer: pure attachment helpers (modality gate + inline content part)
- **Status:** DONE
- **What I did:** Added `CMS/src/lib/chat/attachments.ts` (dep-free): `mimeToModality(mime)` (image/audio/video by prefix, everything else `file`), `acceptsFile(modelInputModalities, mime)` (gates a MIME against the selected model's `inputModalities`; empty → text-only → rejects), `toDataUri`, and `toInlineContentPart(mime, base64, name)` → OpenAI/OpenRouter content part (image → `{type:"image_url",image_url:{url:data-URI}}`; else → `{type:"file",file:{filename,file_data:data-URI}}`). Mirrors KNOWN_MODALITIES from models.ts. NO UI.
- **Verified:** `node --test attachments.test.ts` → 8/8 pass (image accepted by vision/rejected by text-only, pdf gating both ways, empty-modalities→text-only, data-URI assembly, both content-part shapes). `npx tsc --noEmit` clean.
- **Files:** CMS/src/lib/chat/attachments.ts, CMS/src/lib/chat/attachments.test.ts

## 2026-06-26 08:26 — `+` picker + drag-and-drop on the chat input, model-gated
- **Status:** DONE
- **What I did:** Wired attachment UI into the shared `ChatConversation` (used by the widget + future surfaces). Added optional `inputModalities?: string[]` prop; when it has a non-text modality the input shows a `+` button (hidden `<input type=file multiple>`) and the textarea becomes a drop-zone (highlighted on drag-over). On pick/drop, each file is gated with `acceptsFile(mods, mime)` — unsupported → localized inline rejection (`chat.attach.rejected`), oversized → `tooLarge`, text-only model → `textOnly` + the `+` is disabled with a hint. Accepted files upload via the EXISTING `POST /api/assets` (reused, not forked) and render as removable chips; multiple files supported; send is gated while uploading and clears the chips. Wired the live catalog into `chat-widget.tsx` (new `catalog` state populated by the existing `/api/chat/models` restore effect via `coerceCatalog`) so the SELECTED model's `inputModalities` flow to `ChatConversation`. EN/FI/ET strings under `chat.attach.*`.
- **Verified:** `npx tsc --noEmit` clean; `npm test` 932/932 pass; `npx opennextjs-cloudflare build` green (dev OFF); regenerated `ProjectManager/src/lib/deploy/cms-bundle.generated.js`. NOT verified live (needs deployed CMS + keyed vision model); threading attachments into the model request (task 3) is NOT done — chips are cleared on send for now.
- **Files:** CMS/src/components/chat/chat-conversation.tsx, CMS/src/components/chat/chat-widget.tsx, CMS/messages/{en,fi,et}.json, ProjectManager/src/lib/deploy/cms-bundle.generated.js

# Journal — ai-attachments
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-26 08:21 — Tracer: pure attachment helpers (modality gate + inline content part)
- **Status:** DONE
- **What I did:** Added `CMS/src/lib/chat/attachments.ts` (dep-free): `mimeToModality(mime)` (image/audio/video by prefix, everything else `file`), `acceptsFile(modelInputModalities, mime)` (gates a MIME against the selected model's `inputModalities`; empty → text-only → rejects), `toDataUri`, and `toInlineContentPart(mime, base64, name)` → OpenAI/OpenRouter content part (image → `{type:"image_url",image_url:{url:data-URI}}`; else → `{type:"file",file:{filename,file_data:data-URI}}`). Mirrors KNOWN_MODALITIES from models.ts. NO UI.
- **Verified:** `node --test attachments.test.ts` → 8/8 pass (image accepted by vision/rejected by text-only, pdf gating both ways, empty-modalities→text-only, data-URI assembly, both content-part shapes). `npx tsc --noEmit` clean.
- **Files:** CMS/src/lib/chat/attachments.ts, CMS/src/lib/chat/attachments.test.ts

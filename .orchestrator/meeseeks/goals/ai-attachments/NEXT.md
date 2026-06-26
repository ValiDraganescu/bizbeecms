# Note to the next Meeseeks (ai-attachments)

Tracer DONE: `CMS/src/lib/chat/attachments.ts` exists with `acceptsFile(modelInputModalities, mime)`
and `toInlineContentPart(mime, base64, name)` (+ `mimeToModality`, `toDataUri`), node-tested 8/8.
The model type already carries `inputModalities` (parsed in `models.ts` `parseInputModalities`).

NEXT TASK (BACKLOG task 2): **`+` file picker + drag-and-drop on the chat textarea, gated to the
selected model.** Edit `CMS/src/components/chat/chat-conversation.tsx`:
- `+` button (hidden `<input type=file multiple>`) + drag-and-drop over the textarea.
- On drop/pick run `acceptsFile(selectedModel.inputModalities, file.type)` — unsupported → localized
  inline rejection, no attach. Disable `+`/drop (with a hint) when the model is text-only.
- Accepted files upload via the EXISTING `POST /api/assets` (reuse the upload call from
  `components/media/media-gallery.tsx`; respect `MAX_ASSET_SIZE`); render as removable chips.
- EN/FI/ET for all new strings. Gate: tsc + `npm test` + opennext build (dev OFF) + cms-bundle regen.

Watch: how the picker knows the selected model object (inputModalities) — see model-picker.tsx /
selected-model.ts for how the chosen id resolves to a CatalogModel.

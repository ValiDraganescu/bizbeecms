# Note to the next Meeseeks (ai-attachments)

DONE so far (all 3 codeable tasks):
1. Pure helpers `CMS/src/lib/chat/attachments.ts` (`acceptsFile`, `toInlineContentPart`, `mimeToModality`,
   `toDataUri`, `buildUserContent`) — node-tested.
2. UI: `+` picker + drag-and-drop on the chat input, model-gated, reusing `POST /api/assets`, removable
   chips, EN/FI/ET. In the shared `ChatConversation`; `chat-widget.tsx` feeds it the selected model's
   `inputModalities`.
3. **Threading inline base64 (THIS run).** `useChat.send(text, attachments)` fetches each attachment's R2
   bytes (`/media/<key>`), base64-encodes (browser), builds an OpenAI/OpenRouter content ARRAY via
   `buildUserContent`, and sends it through `buildModelHistory`. `content` is now `string | ContentPart[]`
   across `sse.ts` (`parseChatBody`/`parseContentParts`), `build-history.ts`, the `Ai` port, `reframe.ts`.
   Adapter passes messages verbatim → array survives upstream. Transcript bubble stays text (📎 name lines).

NEXT TASK (BACKLOG task 4): **Verify end-to-end (the only non-codeable bit).** Needs a DEPLOYED CMS + a
keyed VISION model (OpenRouter). Steps: deploy a Site CMS; in the assistant pick a vision model; drag an
image onto the input AND use `+` (both should attach + show a removable chip); confirm a TEXT-ONLY model
blocks non-text with a clear message; send the image and confirm the model RESPONDS ABOUT the image (proves
the inline base64 round-trip works); confirm multiple files work. Record the live round-trip in the journal.

Watch / ideas if you want a codeable slice instead:
- `/api/assets` is IMAGE-ONLY (CAVEATS) — images work end-to-end NOW; PDFs/audio 400 until `ALLOWED_ASSET_TYPES`
  + `EXT_BY_TYPE` are widened (and `validateAsset` test). Do this when a file/audio model need arrives — that
  would be a real codeable task to unblock the `file`/`audio` modality gating that already exists.
- HISTORY persistence stores string content today (`chat-widget.tsx` save effect + `/api/chat/history`); the
  attachment R2 keys aren't persisted on the stored message yet. If you want transcripts to re-render
  attachments after reload, store the keys alongside. Low priority (images already reach the model live).
- Gate as usual: CMS tsc + `npm test` + `npx opennextjs-cloudflare build` (dev OFF) + regen
  `ProjectManager/src/lib/deploy/cms-bundle.generated.js` (`cd ProjectManager && npm run bundle:cms`).

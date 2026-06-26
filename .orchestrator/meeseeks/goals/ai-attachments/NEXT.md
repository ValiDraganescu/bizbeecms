# Note to the next Meeseeks (ai-attachments)

DONE so far: (1) pure helpers `CMS/src/lib/chat/attachments.ts` (`acceptsFile`, `toInlineContentPart`,
`mimeToModality`, `toDataUri`), node-tested. (2) UI: `+` picker + drag-and-drop on the chat input,
model-gated, reusing `POST /api/assets`, removable chips, EN/FI/ET. Lives in the shared
`ChatConversation` (`CMS/src/components/chat/chat-conversation.tsx`); `chat-widget.tsx` feeds it the
selected model's `inputModalities` via the new `catalog` state + `inputModalities` prop.

NEXT TASK (BACKLOG task 3): **Thread attachments into the chat request as inline base64.**
Currently `ChatConversation.onSend` CLEARS the pending `attachments` and only sends the text string —
the bytes never reach the model. To finish:
- Plumb the pending `PendingAttachment[]` (key/url/name/mime, exported from chat-conversation.tsx) into
  `useChat.send` (add a 2nd arg). On send, for each: fetch `/media/<key>` (the `url`), base64-encode the
  bytes, and build the message `content` as an ARRAY: a `{type:"text"}` part + one
  `toInlineContentPart(mime, base64, name)` per file (instead of the plain string).
- Keep the R2 key on the STORED message for history (the persisted shape in `chat-widget.tsx`'s save
  effect + `/api/chat/history` is string-content today — extend it or store keys alongside).
- VERIFY the content-ARRAY survives the chat route + OpenRouter adapter to the upstream request (CAVEAT:
  they may assume STRING content and 400/drop it). `buildModelHistory` (`lib/chat/build-history.ts`) also
  assumes string content — check it.
- Node-test the assembled multi-part message for an image attachment.

Watch:
- `/api/assets` is IMAGE-ONLY (see CAVEATS) — images work end-to-end; PDFs/audio 400 until you widen
  `ALLOWED_ASSET_TYPES`.
- Gate as usual: CMS tsc + `npm test` + `npx opennextjs-cloudflare build` (dev OFF) + regen
  `ProjectManager/src/lib/deploy/cms-bundle.generated.js` (`cd ProjectManager && npm run bundle:cms`).

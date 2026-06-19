# Note to the next Meeseeks (ai-assistant)

DONE so far: `POST /api/translate` — the programmatic AI-translate engine
(`lib/chat/translate-request.ts` + `app/api/translate/route.ts`, tested). It reuses
`validateTranslationInput` + `applyTranslation` + the `Ai` gateway. The page-builder
AI-translate BUTTON (page-builder goal) should call THIS endpoint — don't fork a model client.

PICK NEXT: **Slice 1 — Intercom-style chat widget shell** (top of BACKLOG after the translate task).
Build the floating bubble (bottom-right, fixed) in the CMS admin layout that opens a compact chat panel,
reusing the EXISTING transport (`app/api/chat/route.ts` + `lib/chat/client-sse.ts`) — do NOT fork a new
chat pipeline. Layout/transport only; page-awareness (Slice 2), tool ports (Slice 3), debug/model-picker/
history (Slice 4) come after. EN/FI/ET for the widget chrome. Gate: CMS tsc + opennext build green; regen
PM cms-bundle.

WATCH OUT (read CAVEATS): the `Ai` port is streaming-only (use `collectStreamText` for non-streaming);
`applyTranslation` rejects component targets (page-only); small CF models fence their JSON.

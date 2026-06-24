# Journal — ai-widget-ux
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-24 13:57 — Resizable assistant panel + preset sizes (default ⇄ half)
- **Status:** DONE
- **What I did:** Made the open chat panel resizable. New pure helper
  `CMS/src/lib/chat/panel-size.ts` (defaultSize/halfSize/clamp/resolveSize/nextPreset +
  localStorage load/save under key `bizbee.chat.panelSize`). In `chat-widget.tsx`: replaced the
  fixed `h-[min(70vh,560px)] w-[min(92vw,380px)]` classes with an inline px style driven by a
  `panel` state; added native CSS `resize` on the panel container (free-drag, captured on
  `onMouseUp` as a "custom" px size); added a header toggle button (default ⇄ half-screen) before
  Minimize. Size persists across open/close + reloads; re-clamped to the live viewport on mount and
  on window resize so a panel sized big on one screen can never vanish on a small one (min 300×320).
  Added EN/FI/ET `chat.widget.sizeHalf` + `sizeCompact` strings.
- **Verified:** `node --test panel-size.test.ts` (8 pass), `npx tsc --noEmit` clean, full `npm test`
  804 pass, `npx opennextjs-cloudflare build` succeeded (dev confirmed OFF). Did NOT regen the PM
  cms-bundle (concurrent ai-openrouter Meeseeks has uncommitted CMS edits in the tree —
  `bundle:cms` would capture their work; the bundle auto-regens on PM deploy anyway).
- **Files:** CMS/src/lib/chat/panel-size.ts (+test), CMS/src/components/chat/chat-widget.tsx,
  CMS/messages/{en,fi,et}.json (only the two size keys staged).

## 2026-06-24 14:02 — Chat input → resizable textarea + Enter-behaviour switch
- **Status:** DONE
- **What I did:** Replaced the single-line `<input>` in `chat-conversation.tsx` with a
  `<textarea rows={3}>` (CSS `resize-y`, min `5.5rem` / max `16rem`). Added an Enter-mode toggle
  button: **"↵ Send"** (Enter sends, Shift+Enter newline) ⇄ **"↵ Newline"** (Enter newline,
  Cmd/Ctrl+Enter sends). Default = send (legacy behaviour). New pure helper
  `lib/chat/enter-mode.ts`: `decideSendOnEnter(mode, {shift,meta,ctrl})` + `loadEnterMode`/
  `saveEnterMode` (localStorage `bizbee.chat.enterMode`). Mode restored on mount via `useEffect`,
  persisted on toggle. `onKeyDown` on the textarea consults the helper. Added EN/FI/ET
  `chat.enterMode.{send,newline,aria}`.
- **Verified:** `node --test enter-mode.test.ts` 7 pass (both modes × modifier combos);
  `npx tsc --noEmit` clean; full `npm test` 812 pass; `npx opennextjs-cloudflare build` succeeded
  (dev confirmed OFF, port 3601 free). Did NOT regen the PM cms-bundle (concurrent ai-openrouter
  loop edits the same CMS dir; bundle auto-regens on PM deploy).
- **Files:** CMS/src/lib/chat/enter-mode.ts (+test), CMS/src/components/chat/chat-conversation.tsx,
  CMS/messages/{en,fi,et}.json (only the three enterMode keys staged).

## 2026-06-24 14:06 — Persist the selected model across reloads
- **Status:** DONE
- **What I did:** New pure helper `CMS/src/lib/chat/selected-model.ts`:
  `resolveInitialModel(stored, catalogIds, fallback)` (stored-id kept only if still in the catalog;
  empty catalog → trust a non-empty stored id since the chat route validates server-side; absent →
  fallback) + `loadModel`/`saveModel` (localStorage `bizbee.chat.model`, guarded). In
  `chat-widget.tsx`: model `useState` now wrapped by a `setModel(id)` that writes through to storage;
  a mount `useEffect` restores the stored id, fetching `/api/chat/models` to validate against live
  catalog ids before applying `resolveInitialModel`. No new i18n strings (no visible label changed).
- **Verified:** `node --test selected-model.test.ts` 5 pass; `npx tsc --noEmit` clean; full `npm test`
  818 pass; `npx opennextjs-cloudflare build` succeeded (dev confirmed OFF, port 3601 free). Did NOT
  regen the PM cms-bundle (concurrent ai-openrouter loop edits the same CMS dir; auto-regens on PM deploy).
- **Files:** CMS/src/lib/chat/selected-model.ts (+test), CMS/src/components/chat/chat-widget.tsx.

## 2026-06-24 14:10 — Unread badge on the launcher when minimized + a reply arrives
- **Status:** DONE
- **What I did:** New pure helper `CMS/src/lib/chat/unread-badge.ts`:
  `nextUnread(current, {open, replyFinished})` — opening always clears, a reply finishing while
  closed sets, otherwise unchanged. In `chat-widget.tsx`: added `unread` state; set it on the existing
  busy→idle finish edge (the save effect, ~line 138) via `setUnread(cur => nextUnread(cur, {open,
  replyFinished:true}))` and added `open` to that effect's deps; a dedicated `useEffect([open])` clears
  `unread` whenever the panel opens. Rendered a small `bg-danger` dot (border-surface ring) absolutely
  positioned top-right on the launcher button, shown only when `unread && !open`, with `role="status"`
  + `chat.widget.unread` aria-label/title. Added EN/FI/ET `chat.widget.unread`.
- **Verified:** `node --test unread-badge.test.ts` 5 pass; `npx tsc --noEmit` clean; full `npm test`
  831 pass; `npx opennextjs-cloudflare build` succeeded (dev confirmed OFF, port 3601 free). Did NOT
  regen the PM cms-bundle (concurrent ai-openrouter loop edits the same CMS dir; auto-regens on PM deploy).
- **Files:** CMS/src/lib/chat/unread-badge.ts (+test), CMS/src/components/chat/chat-widget.tsx,
  CMS/messages/{en,fi,et}.json (only the `chat.widget.unread` key staged).

## 2026-06-24 14:16 — Tool-call cards: name once + input/output accordion
- **Status:** DONE
- **What I did:** Fixed the duplicate-name label and made each tool card a collapsible
  accordion. New pure helper `CMS/src/lib/chat/tool-card.ts`: `toolSubject` (component/page/
  target, but NEVER the name → kills the dup), `toolSummary` (action + subject suffix, name
  rendered separately), `formatBlob` (pretty-print + truncate input/output). Threaded the call
  args + raw result to the client: extended `ToolResult` (`client-sse.ts`) with `input?`/`output?`
  (`output` = the whole tool frame minus the threaded `input`); `route.ts` `runToolsRound` now
  frames `{ ...data, input: call.args }`. `ToolCard` in `chat-conversation.tsx` is now a native
  `<details>`/`<summary>` accordion (collapsed by default): summary shows `name` + summary text +
  fail badge; expands to show errors + Input/Output `<pre>` blobs. Removed the now-unused
  `chat.tool.ok`/`chat.tool.fail` join strings; added `chat.tool.{failBadge,input,output}` in
  EN/FI/ET.
- **Verified:** `node --test tool-card.test.ts` 8 pass (subject dedup, summary, blob truncate);
  `npx tsc --noEmit` clean; full `npm test` 839 pass; all three messages JSON parse; `npx
  opennextjs-cloudflare build` succeeded (dev confirmed OFF, port 3601 free). Did NOT regen the PM
  cms-bundle (concurrent ai-openrouter loop edits the same CMS dir; auto-regens on PM deploy).
- **Files:** CMS/src/lib/chat/tool-card.ts (+test), CMS/src/lib/chat/client-sse.ts,
  CMS/src/app/api/chat/route.ts, CMS/src/components/chat/chat-conversation.tsx,
  CMS/messages/{en,fi,et}.json (only the three chat.tool keys staged).

## 2026-06-24 14:20 — Persist tool calls in chat history (survive refresh / reload)
- **Status:** DONE
- **What I did:** Tool cards now round-trip. NO migration — the `chat_thread.messages`
  column is already a JSON blob, so tools live inside each assistant message object.
  `lib/chat/history.ts`: `ThreadMessage` gained optional `tools?: StoredTool[]`
  (`StoredTool = Record<string,unknown>` — the opaque client `ToolResult` shape, kept
  opaque so the pure module never imports `@/`). New exported `sanitizeTools(raw)`:
  keeps only array-of-plain-object entries, JSON-roundtrips each (strips functions/
  cycles), caps at 50, returns undefined when empty. `validateThreadInput` attaches
  sanitized `tools` to ASSISTANT turns only (user-turn tools dropped); `parseStoredMessages`
  restores them the same way (garbage → dropped, legacy threads with no field load fine).
  Store unchanged — `JSON.stringify(input.messages)` already carries tools through.
  `chat-widget.tsx`: save payload includes `tools: m.tools` for assistant turns; `openThread`
  JSON type widened with `tools?`. `chat-conversation.tsx` `seed()` now restores
  `tools` (`Array.isArray(m.tools) ? m.tools as ToolResult[] : []`) instead of `[]`.
  Stored shape = the enriched accordion shape (input/output) so reloaded cards expand.
- **Verified:** `node --test history.test.ts` 6 pass (round-trip incl. input/output,
  assistant-only, garbage drop, 50-cap, legacy load); `npx tsc --noEmit` clean; full
  `npm test` 845 pass; `npx opennextjs-cloudflare build` succeeded (dev confirmed OFF,
  :3601 free). Did NOT regen the PM cms-bundle (concurrent loops edit the shared CMS dir;
  auto-regens on PM deploy). No new i18n strings (no visible label changed).
- **Files:** CMS/src/lib/chat/history.ts (+new history.test.ts),
  CMS/src/components/chat/chat-widget.tsx, CMS/src/components/chat/chat-conversation.tsx.

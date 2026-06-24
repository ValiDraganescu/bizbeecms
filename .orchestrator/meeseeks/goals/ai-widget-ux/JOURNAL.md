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

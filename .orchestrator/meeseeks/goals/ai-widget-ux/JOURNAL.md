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

## 2026-06-24 14:26 — Export chat as full model-payload JSON (PM-SSO only)
- **Status:** DONE
- **What I did:** Built the PM-SSO debug export. (1) Pure `CMS/src/lib/auth/pm-sso.ts`:
  `isPmSsoEmail`/`isPmSsoUser` — matches the synthetic `@pm.sso` email (the documented SSO
  signal; case-insensitive/trimmed, fail-closed on null/empty). +`pm-sso.test.ts` (3 cases:
  sso→true, gmail/acme/local→false, null/empty→false). (2) `guard.ts`: `currentUserIsPmSso()`
  (resolves session→user→predicate) + `requirePmSso(request)` (401 not-signed-in, else 403 if
  not PM-SSO) — the REAL server gate, built ONCE for the system-prompt task to reuse. (3) New
  `POST /api/chat/export` route: chose POST over the spec's GET because the EXACT payload needs
  the transcript MESSAGES which are client-side — it re-assembles system prompt
  (`assembleSystemPrompt`, same as `withSystemPrompt`) + messages + `toolSchemasForContext` +
  `resolveModel` (validated against catalog cache), NO model call; returns JSON. (4) `GET
  /api/chat/debug` now also returns `isPmSso` so the panel shows the button only for SSO. (5)
  `ChatDebugPanel` gained `messages`/`model` props + an "Export chat" button (download
  `chat-payload-<context>.json` via Blob; drops empty-content turns so the route won't 400 on an
  in-progress assistant turn); wired from `chat-widget.tsx`. EN/FI/ET `chat.debug.{export,
  exporting,exportError}`.
- **Verified:** `node --test pm-sso.test.ts` 3 pass; `npx tsc --noEmit` clean; full `npm test`
  848 pass; `npx opennextjs-cloudflare build` succeeded (dev confirmed OFF, :3601 free). Did NOT
  regen the PM cms-bundle (concurrent loops share the CMS dir; auto-regens on PM deploy).
- **Files:** CMS/src/lib/auth/pm-sso.ts (+pm-sso.test.ts), CMS/src/lib/auth/guard.ts,
  CMS/src/app/api/chat/export/route.ts (new), CMS/src/app/api/chat/debug/route.ts,
  CMS/src/components/chat/chat-debug-panel.tsx, CMS/src/components/chat/chat-widget.tsx,
  CMS/messages/{en,fi,et}.json (only the three chat.debug keys staged).

## 2026-06-24 14:32 — System-prompt versions: SERVER slice (table + CRUD route + chat-route override)
- **Status:** DONE
- **What I did:** Built the whole SERVER half of the in-chat system-prompt editor (the UI
  dropdown is the next run's slice — decomposed for scope). (1) New D1 table `prompt_version`
  (id, label, prompt, createdAt) in `schema.ts` + generated migration
  `migrations/0015_sleepy_mephisto.sql` (`npm run db:generate`). (2) Thin store
  `db/prompt-version-store.ts`: `listPromptVersions`/`createPromptVersion`/`deletePromptVersion`
  (id `pv_<ts36>_<rand>`, newest-first, limit 100, injectable Db for tests). (3) Pure
  `lib/chat/prompt-version.ts` (+8-case test): `validatePromptInput` (label 1..80, prompt
  1..20000, trimmed) + `effectiveSystemPrompt({override,isPmSso,assembled})` — override wins
  ONLY when PM-SSO AND non-empty string, else assembled (the single trust gate). (4) Gated CRUD
  route `GET/POST/DELETE /api/chat/prompts` — `requirePmSso` on EVERY verb (reused, not rebuilt).
  (5) Wired the override into `POST /api/chat/route.ts`: reads untrusted `systemPromptOverride`
  from the body, resolves `currentUserIsPmSso()` ONLY if present, passes both into the now-
  4-arg `withSystemPrompt` which applies `effectiveSystemPrompt`. Non-SSO override is ignored
  (defense-in-depth atop the route gate); site default real users get is never touched.
- **Verified:** `node --test prompt-version.test.ts` 7 pass; `npx tsc --noEmit` clean; full
  `npm test` 855 pass; `npx opennextjs-cloudflare build` succeeded (dev confirmed OFF, :3601 free).
  Did NOT regen the PM cms-bundle (concurrent loops share the CMS dir; auto-regens on PM deploy).
  Live D1 (migration apply + real CRUD) is HITL — build-verified only. No new i18n THIS run (the
  user-facing strings land with the UI slice next run).
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0015_sleepy_mephisto.sql (+ meta/_journal.json),
  CMS/src/db/prompt-version-store.ts (new), CMS/src/lib/chat/prompt-version.ts (+test, new),
  CMS/src/app/api/chat/prompts/route.ts (new), CMS/src/app/api/chat/route.ts.

## 2026-06-24 14:37 — System-prompt versions — UI slice (PM-SSO only)
- **Status:** DONE
- **What I did:** Wired the widget UI to the already-built prompt-versions server slice.
  `useChat` gained an optional 3rd getter `getOverride?: () => string | undefined`; when it
  returns a value, the chat POST body now carries `systemPromptOverride` (route already gates it to
  PM-SSO). `chat-widget.tsx` holds `promptOverride` state, passes `() => promptOverride ?? undefined`
  to `useChat`, and passes `override`+`onOverrideChange` down to `ChatDebugPanel`. The debug panel
  (already PM-SSO-gated via `GET /api/chat/debug`'s `isPmSso`) gained a versions section: a select
  (Default ⇄ saved versions; fetched from `GET /api/chat/prompts` once PM-SSO is known), a "New"
  button that seeds an inline label-input + textarea from the assembled default prompt
  (`systemPrompt` from the debug fetch), Save (`POST {label,prompt}`, auto-selects + activates the
  new version), Cancel, and Delete (`DELETE ?id=`). Selecting a version sets the override; selecting
  "Default" clears it (back to assembled). Override is session-only/per-request — never persisted as
  a site default. EN/FI/ET `chat.debug.prompts.*` (14 keys each). No native dialogs.
- **Verified:** CMS `npx tsc --noEmit` clean; `npm test` 856 pass; `npx opennextjs-cloudflare build`
  (dev OFF, port 3601 free) succeeded — worker saved. Could not exercise live CRUD (needs real D1
  binding = HITL) but the route + store + pure helper were build-verified in the prior server slice.
- **Files:** CMS/src/components/chat/chat-conversation.tsx (useChat getOverride),
  CMS/src/components/chat/chat-widget.tsx (promptOverride state + props),
  CMS/src/components/chat/chat-debug-panel.tsx (versions UI), CMS/messages/{en,fi,et}.json

## 2026-06-24 14:45 — Active-override label near the chat input (PM-SSO)
- **Status:** DONE
- **What I did:** When a saved system-prompt version is active, the widget now shows an inline
  warning banner above the model row near the chat input ("Custom prompt: <label>" / "Custom prompt
  active" when unnamed) with a "Use default" clear button — so the operator always knows they're
  off-default, not just inside the debug panel. `ChatDebugPanel.onOverrideChange` is now
  `(prompt, label)`; widget holds `overrideLabel` + `applyOverride(prompt,label)`. Clearing from the
  banner clears the override (and a new effect in the panel resyncs its `<select>` to "Default" when
  `override` goes null externally). Banner uses `bg-warning-subtle`/`text-warning` tokens. New i18n
  `chat.widget.{overrideActive,overrideActiveUnnamed,overrideTitle,overrideClear}` EN/FI/ET.
- **Verified:** CMS `npx tsc --noEmit` clean; `npm test` 856 pass; `npx opennextjs-cloudflare build`
  OK (dev off, 3601 free); all 3 message JSONs parse. Did not exercise live (HITL — needs a PM-SSO
  session + saved version).
- **Files:** CMS/src/components/chat/chat-widget.tsx, CMS/src/components/chat/chat-debug-panel.tsx,
  CMS/messages/{en,fi,et}.json

## 2026-06-24 — Scroll-to-bottom affordance in the transcript
- **Status:** DONE
- **What I did:** The transcript used to scroll-to-bottom on every send; now it auto-follows new
  content ONLY while the reader is parked at the bottom (a `useEffect([messages])` gated by the new
  pure `isAtBottom` helper). When scrolled up (and there are messages), a centered "Jump to latest ↓"
  pill (`bg-surface-raised` + `shadow-md`, design tokens) appears over the transcript and scrolls to
  bottom on click. Tracking via an `onScroll` handler → `atBottom` state. Wrapped the scroll div in a
  `relative flex min-h-0 flex-1 flex-col` parent for the absolute pill; kept the `flex-1`/`min-h-0`
  chain so both callers (`admin-chat.tsx` h-[60vh], widget panel) keep their layout.
- **Helper:** pure `lib/chat/scroll-anchor.ts` `isAtBottom({scrollTop,scrollHeight,clientHeight},
  tol=24)` — 24px tolerance so streaming sub-pixel drift doesn't flap the pill. 5-case node test.
- **Verified:** CMS `npx tsc --noEmit` clean; `npm test` 862 pass; `npx opennextjs-cloudflare build`
  OK (dev off, 3601 free); all 3 message JSONs parse. messages/ was clean vs HEAD so a plain edit was
  safe (no concurrent ai-openrouter keys to preserve this run).
- **Files:** CMS/src/lib/chat/scroll-anchor.ts (+.test.ts),
  CMS/src/components/chat/chat-conversation.tsx, CMS/messages/{en,fi,et}.json

## 2026-06-24 14:53 — Keyboard a11y pass: Esc-to-minimize + focus-ring on widget buttons
- **Status:** DONE
- **What I did:** Pure-client a11y polish on `chat-widget.tsx`. (1) The open dialog div gained an `onKeyDown` that minimizes the panel on `Escape` (keyboard parity with the close button; `stopPropagation` so it doesn't bubble past the dialog). (2) All header icon-buttons (new/history/debug/preset/minimize) AND the floating launcher now carry a visible `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` (launcher adds `ring-offset-2 ring-offset-surface` so the ring reads against the page). No new i18n — reused existing `chat.widget.*` labels; `ring`/`--color-ring` token already in globals.css.
- **Verified:** CMS `npx tsc --noEmit` (exit 0), `npm test` (862 pass), `npx opennextjs-cloudflare build` (dev OFF, port 3601 free, build complete). Did not click-test in browser (no live session this run) — but Esc handler + Tailwind focus utilities are standard idioms.
- **Files:** CMS/src/components/chat/chat-widget.tsx

## 2026-06-24 14:58 — Tool-card "show more" truncation
- **Status:** DONE
- **What I did:** Added pure `blobView(value,max)` to `lib/chat/tool-card.ts` returning `{full, preview, hidden, truncated}` (factored a shared `stringifyBlob`; left `formatBlob` untouched for back-compat). Rewired `ToolCard`/`ToolBlob` in `chat-conversation.tsx`: `ToolBlob` takes the blob view + `t`, holds `useState(expanded)`, and when `blob.truncated` renders a token-styled "Show {count} more chars" ⇄ "Show less" button (focus-visible:ring-ring, matching the rest of the widget) that swaps preview↔full text. Added `chat.tool.{showMore,showLess}` to EN/FI/ET.
- **Verified:** CMS `npx tsc --noEmit` clean; `npm test` 867 pass (was 862; +3 new `blobView` cases incl. truncated/not-truncated/undefined, +2 already there); `npx opennextjs-cloudflare build` (dev off, port 3601 free) completed (worker.js emitted). Didn't manually click the toggle in a live browser (no live session this run) — covered by the logic test + the build.
- **Files:** `CMS/src/lib/chat/tool-card.ts`, `CMS/src/lib/chat/tool-card.test.ts`, `CMS/src/components/chat/chat-conversation.tsx`, `CMS/messages/{en,fi,et}.json`

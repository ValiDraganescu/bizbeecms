# Caveats — ai-widget-ux
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **This goal is CLIENT/UX only.** Don't touch the OpenRouter adapter, key handling, or model
  catalog DATA (prices/modalities/tool-capability filter/credit) — those live in `ai-openrouter`.
  You work on the widget components + UI-pref persistence + chat-history round-trip.
- **TWO PM-SSO DEBUG TASKS break the client-only rule (on purpose).** "Export chat JSON" and
  "system-prompt editor + versions" DO add server routes (+ a D1 table/migration for prompt versions).
  They share a `isPmSsoUser(user)` predicate — BUILD IT ONCE, reuse. PM-SSO = SSO-provisioned row
  (synthetic `@pm.sso` email via `ssoSyntheticEmail`, `db/user-store.ts:66`), NOT Google, NOT local.
  Gate on the SERVER (403 + IGNORE any override field for non-SSO callers), never just by hiding UI.
  The system-prompt override applies to the requesting operator's SESSION ONLY (per-request field) —
  it must NEVER change the site default real end-users get.
- **Widget files:** shell = `CMS/src/components/chat/chat-widget.tsx` (open/minimize, model state at
  line ~38, layout). Transcript/input/tool-cards = `CMS/src/components/chat/chat-conversation.tsx`
  (input `<input>` ~236, tool render `ToolCard` ~294, `ToolResult` type ~24, history `seed()` ~134).
- **Tool calls are NOT persisted today** (`chat-conversation.tsx:133` comment + `seed()` `tools: []`).
  History stores only `{role, content}`. Several tasks here change that — coordinate the accordion +
  persistence tasks so the STORED tool shape matches the RENDERED one (input/output included).
- **Coordinate with `ai-openrouter` on the model type.** Tasks there add `inputModalities`,
  `inputPrice/outputPrice`, tool-capability filtering to the model objects. If a widget task reads
  model fields, expect the type to be evolving — don't fight it, align.
- **Panel sizing is inline-px, resized via a TOP-LEFT pointer-drag handle (native CSS `resize` is GONE,
  done 2026-06-24).** The panel `<div>` carries `style={{width,height}}` from `panel` state (resolved via
  `lib/chat/panel-size.ts`, persisted under localStorage `bizbee.chat.panelSize`). It's still
  `fixed bottom-24 right-6`, so it grows up/LEFT from the bottom-right anchor — that's why the handle is
  at the TOP-LEFT corner (the old native bottom-right grip was pinned under the launcher, ungrabbable).
  The handle is an `absolute left-0 top-0` div with `onPointerDown={startResize}`; `startResize` attaches
  window pointermove/up listeners and calls pure `sizeFromDrag(start, dx, dy, vw, vh)` = `clamp(width-dx,
  height-dy)` (drag left/up grows, since anchored bottom-right). `touch-none` on the handle so touch-drag
  resizes instead of scrolling. Don't re-add `w-[...]/h-[...]` classes or the `resize` CSS class — they'd
  fight the inline style. Min size 300×320 so it can't vanish. The old `captureDrag`/`onMouseUp` (the P2
  toggle bug's root cause) is REMOVED — the expand toggle no longer gets a stray "custom" re-capture.
- **`chat.widget.resize` i18n key already exists in HEAD** (EN/FI/ET) — reuse it, don't re-add (a
  duplicate JSON key is harmless but messy). It labels the resize handle.
- **Do NOT run `bundle:cms` while another loop has uncommitted CMS edits.** The PM cms-bundle
  (`ProjectManager/src/lib/deploy/cms-bundle.generated.js`) auto-regens on PM deploy (`predeploy`), and
  regenerating it captures EVERY uncommitted CMS file in the tree — including a concurrent Meeseeks's.
  This goal runs alongside `ai-openrouter` editing the same CMS dir, so leave the bundle to deploy.
- **i18n files are shared across concurrent goals.** `CMS/messages/{en,fi,et}.json` gets edited by
  ai-openrouter too. Stage ONLY your own keys: drop the other goal's keys, `git add` the file (now
  showing just yours), then restore theirs unstaged. Never `git add -A`.
- **`CMS/src/lib/chat/models.ts` is ai-openrouter's territory** and is often modified-uncommitted in
  the shared tree. `npx tsc --noEmit` / the opennext build can transiently FAIL on it mid-their-edit
  (missing field on `CatalogModel`, etc.). Don't touch it; just re-run the gate — it goes green once
  their edit settles. Never stage `models.ts`.
- **Staging shared i18n: rebase your keys onto HEAD, don't `git add` the working file.** The working
  `messages/{en,fi,et}.json` may already carry ai-openrouter's uncommitted keys (e.g. `widget.modality*`).
  A plain `git add` would sweep those in. Instead rebuild the file from `git show HEAD:CMS/messages/<loc>.json`
  + ONLY your keys, write that, then `git add` — the diff is then yours alone.
- **`ToolResult` now carries `input`/`output` (accordion DONE 2026-06-24).** `client-sse.ts`
  `ToolResult` gained `input?: unknown` (the call args) + `output?: unknown` (the full raw tool
  frame minus the threaded `input`). The chat route frames `{ ...data, input: call.args }`. The
  PERSISTENCE task MUST store this enriched shape (input+output) so reloaded cards expand too — not
  just name/ok/action. `seed()` (~line 141 now) still sets `tools: []`.
- **Tool calls now persist (DONE 2026-06-24) inside the `messages` JSON — NO separate column.**
  `ThreadMessage` has optional `tools?: StoredTool[]` (`StoredTool = Record<string,unknown>`, the
  opaque client `ToolResult`); the pure `history.ts` never imports `@/`/`ToolResult` on purpose.
  `sanitizeTools` (exported) gates them: assistant-turn-only, plain-objects-only, JSON-roundtripped,
  capped at 50. If you change the rendered `ToolResult` shape, the STORED shape changes automatically
  (it's opaque) — but `seed()` casts `m.tools as ToolResult[]`, so a card field the renderer now
  requires that an OLD stored thread lacks must be optional/defensive in the render layer (it already
  is: `toolSummary`/`formatBlob` tolerate missing fields). Don't add a tools column/migration — wasteful.
- **`isPmSsoUser` is BUILT (DONE 2026-06-24) — reuse it, don't rebuild.** Pure
  `CMS/src/lib/auth/pm-sso.ts`: `isPmSsoUser({email})` / `isPmSsoEmail(email)` match the synthetic
  `@pm.sso` suffix (case-insensitive, fail-closed). Server gate = `requirePmSso(request)` +
  `currentUserIsPmSso()` in `guard.ts` (401 not-signed-in → 403 non-SSO). The system-prompt task
  MUST reuse these, not duplicate. **Known leak (note for that task):** the user table has NO
  origin column; `upsertSsoUser` BACKFILLS a synthetic `@pm.sso` row to the operator's REAL email
  once PM returns it — so a long-lived SSO operator can stop matching `@pm.sso` and lose access to
  the debug tools. Acceptable for now (debug-only); the proper fix is an explicit `origin` column
  on `user`. Don't widen the predicate to "passwordHash IS NULL" — that'd also let Google users in,
  which the spec forbids.
- **Export route is `POST /api/chat/export`, NOT GET (DONE 2026-06-24).** The spec said GET mirroring
  debug, but the EXACT payload needs the transcript MESSAGES which are client-side — a GET can't see
  them. So it's a POST taking the chat-POST body shape (`{messages, context, model}`), re-assembling
  system prompt + messages + tool schemas + resolved model and returning JSON (no model call). The
  debug panel filters empty-content turns before sending (an in-progress assistant turn would 400).
  `GET /api/chat/debug` now also returns `isPmSso` so the panel shows the export button only for SSO.
- **System-prompt versions SERVER slice is BUILT (DONE 2026-06-24) — the UI is what's left.** D1
  table `prompt_version` (migration `0015_sleepy_mephisto.sql`, generated via `npm run db:generate`),
  store `db/prompt-version-store.ts`, pure `lib/chat/prompt-version.ts`
  (`validatePromptInput`, `effectiveSystemPrompt`), gated CRUD `/api/chat/prompts` (`requirePmSso`).
  The chat route ALREADY honours a per-request `systemPromptOverride` body field — applied ONLY when
  `currentUserIsPmSso()` (it's resolved only if the field is present, to skip the lookup otherwise).
  Don't rebuild any of this; the UI slice just wires the widget to these endpoints. The override is
  session-only (per-request) — NEVER write it as a site default. `effectiveSystemPrompt` is the single
  trust gate (override wins only when PM-SSO + non-empty string); the route ignores it for non-SSO.
- **`withSystemPrompt` is now 4-arg** (`messages, context, override?, isPmSso?`) in `route.ts`. If you
  touch the chat POST, keep passing the override through; default both new args so old callers are safe.
- **System-prompt override is wired via a 3rd `useChat` getter (UI slice DONE 2026-06-24).**
  `useChat(getContext?, getModel?, getOverride?)` — `getOverride` returns the selected version's
  prompt text (or undefined); `send` adds `systemPromptOverride` to the chat POST only when set.
  `chat-widget.tsx` owns `promptOverride` state, passes `() => promptOverride ?? undefined` to
  `useChat`, and threads `override`/`onOverrideChange` to `ChatDebugPanel`. The versions editor lives
  IN `ChatDebugPanel` (already PM-SSO-gated). To add any new per-request chat-body field, follow this
  same getter pattern — don't bypass `useChat`. The route gates the override to PM-SSO; the override
  is session-only, NEVER persisted as a site default.
- **`onOverrideChange` is `(prompt, label)` since 2026-06-24.** The PM-SSO prompt-version override
  now threads the version LABEL up too (for the inline "off-default" banner near the chat input).
  Widget owns `promptOverride` + `overrideLabel`, both set via `applyOverride(prompt,label)` (clear =
  `applyOverride(null,null)`). The debug panel has an effect that resyncs its `<select>` to "Default"
  when `override` becomes null externally (the banner's "Use default" button). The inline banner uses
  `bg-warning-subtle` + `text-warning` (NOT `text-warning-foreground` — that's near-white, only legible
  ON `bg-warning`). Keep both override setters together; don't set one without the other.

- **Transcript follows-bottom only when parked there (scroll-anchor DONE 2026-06-24).** The transcript
  scroll div is now wrapped in a `relative flex min-h-0 flex-1 flex-col` parent (for the absolutely-
  positioned "Jump to latest" pill). The flex chain is: outer `flex min-h-0 flex-1 flex-col gap-3` →
  this new wrapper → scroll div (`flex-1 min-h-0 overflow-y-auto`). BOTH callers pass
  `transcriptClassName="flex-1"` and live inside a bounded-height `flex flex-col` (`h-[60vh]` page /
  widget panel). Don't remove the `min-h-0`s or the inner `flex-1` — overflow scrolling breaks if the
  chain collapses. Auto-scroll lives in a `useEffect([messages])` gated by `isAtBottom`
  (`lib/chat/scroll-anchor.ts`, 24px tolerance so streaming sub-pixel drift doesn't flap the pill);
  don't re-add an unconditional scroll-to-bottom or you'll yank a scrolled-up reader back down.
- **Esc-to-minimize is wired (a11y DONE 2026-06-24)** via `onKeyDown` on the open dialog `<div>` in
  `chat-widget.tsx` (`e.key==="Escape"` → `setOpen(false)`, with `stopPropagation`). It fires for ANY
  focused element inside the panel — including the textarea. If you add an inner overlay/menu that
  needs its OWN Esc (e.g. close a dropdown first), handle+`stopPropagation` it there so it doesn't
  fall through and minimize the whole panel. Focus-ring on the icon-buttons uses
  `focus-visible:ring-2 focus-visible:ring-ring` (token `--color-ring` in globals.css); the launcher
  adds `ring-offset-2 ring-offset-surface`. Reuse this exact idiom for any new widget button.
- **Focus-trap is wired (a11y DONE 2026-06-24).** Panel `<div>` in `chat-widget.tsx` is now
  `aria-modal="true"` + `tabIndex={-1}`; an open→focus rAF effect focuses the textarea (fallback:
  the panel itself). The SAME `onKeyDown` that handles Esc now also traps `Tab`/`Shift+Tab` via a
  live `focusables()` collector (DOM order; skips disabled / `aria-hidden` / `offsetParent===null`)
  + pure `nextTabStop(count,current,shift)` (`lib/chat/focus-trap.ts`). It `preventDefault()`s the
  native tab and wraps. If you add a nested overlay/menu with its OWN focus scope, it must
  `stopPropagation` its Tab keydown (like Esc) so it doesn't fall through to the panel trap.
  `focusables()` recomputes per Tab, so it tracks the panel mode (history/debug/conversation) — no
  stale refs. Don't focus elements outside the panel while open.
- **The model picker must COERCE `/api/chat/models`, never trust its shape (BUG [P1] DONE 2026-06-24).**
  `GET /api/chat/models` serves a D1-CACHED `CatalogModel[]` row. A row written by an OLDER bundle lacks
  fields ai-openrouter later added (`inputModalities`, prices) — and `model-picker.tsx` did
  `m.inputModalities.map(...)` → `undefined.map` → error boundary. Fix lives in WIDGET territory: pure
  `lib/chat/catalog-coerce.ts` `coerceCatalog(j.models)` backfills render-read fields + drops junk; the
  picker coerces on load (not a bare cast) + has a `(m.inputModalities ?? ["text"])` guard at the `.map`.
  RULE: anytime the picker reads a NEW field off a catalog model, add it to `coerceCatalogModel` too, or a
  stale cache row will crash again. Don't "fix" this by editing `models.ts` (ai-openrouter's). The stale
  cache also means: after a catalog-shape change, the deployed site needs a REDEPLOY (clears/rewrites the
  D1 cache) — a code fix alone won't heal already-cached rows on the live worker until then (HITL).
- **Expand/shrink toggle keys off SIZE, not `preset` (BUG [P2] DONE 2026-06-24).** Expanding fires the
  native CSS `resize` `onMouseUp` (`captureDrag`) which sets `preset:"custom"`, so `preset` is unreliable
  for "is the panel big?". `nextPreset(current, isLarge?)` now takes an `isLarge` flag and toggles
  `isLarge ? "default" : "half"`; new pure `isLarge(size, vw, vh, tol=8)` = width > defaultSize+tol. In
  `chat-widget.tsx` a render-level `panelLarge` const (SSR-safe `typeof window` guard) drives the button
  icon/label/`aria-pressed`/active-bg — DON'T revert those to `preset==="half"` (that's the one-way bug).
  The native-resize `onMouseUp` capture is STILL there; the LEFT-edge-rail TODO is meant to remove it —
  when it does, re-confirm the toggle still cycles (the `isLarge` logic stays correct regardless).
- **No native confirm/dialog** (breaks browser-review sessions) — use in-app components. Design-system
  tokens + EN/FI/ET for every new string. Gate each slice on CMS tsc + `npm test` +
  `npx opennextjs-cloudflare build` (dev OFF, NEVER while `npm run dev` is up) + cms-bundle regen.

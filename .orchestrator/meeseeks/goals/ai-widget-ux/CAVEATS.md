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
- **Panel sizing is now inline-px, not Tailwind classes.** `chat-widget.tsx` panel `<div>` carries
  `resize` (native CSS) + a `style={{width,height}}` from `panel` state (resolved via
  `lib/chat/panel-size.ts`, persisted under localStorage `bizbee.chat.panelSize`). It's still
  `fixed bottom-24 right-6`, so it grows up/left from the bottom-right anchor; the native resize grip
  sits at the panel's bottom-right (above the launcher). Don't re-add `w-[...]/h-[...]` classes — they'd
  fight the inline style. Min size 300×320 so it can't vanish.
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
- **No native confirm/dialog** (breaks browser-review sessions) — use in-app components. Design-system
  tokens + EN/FI/ET for every new string. Gate each slice on CMS tsc + `npm test` +
  `npx opennextjs-cloudflare build` (dev OFF, NEVER while `npm run dev` is up) + cms-bundle regen.

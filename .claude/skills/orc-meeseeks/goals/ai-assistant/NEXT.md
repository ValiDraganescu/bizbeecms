# Note to the next Meeseeks (ai-assistant)

DONE this run: **resume current thread on widget mount** (NEXT pick #2). The widget now remembers
the active thread id in `sessionStorage["bizbee.chat.threadId"]` (per-tab) and a run-once mount
effect restores it (else the most recent saved thread via `GET /api/chat/history` → threads[0]),
seeding the transcript with `chat.seed`. Only restores when no thread is loaded; storage access is
try/catch-guarded. Client-only — no backend/route/dep change. Gates green; cms-bundle regen.

PICK NEXT (re-rank as you see fit toward the GOAL — page-aware assistant that builds the site):
  1. **Tool-result UX in the transcript** — now the model chains (round-tripping), a multi-round
     turn emits several `tool` events interleaved with text. Check `chat-conversation.tsx` renders
     the sequence readably (tool cards between assistant text). Likely a small client polish.
  2. **Component-target translation** — `/api/translate` + `applyTranslation` 422 for
     `kind:"component"` BY DESIGN: components are static artifacts, their translatable text lives in
     block props at the page use-site, NOT in the component. This is a real DESIGN task (where does
     per-locale component copy even live?), not a quick wire-up — decompose it before starting; it
     may deserve its own backlog slice or a flag to the driver. Don't half-build it.
  3. **Searchable model picker over the FULL AI Gateway catalog** (big backlog TODO, bottom of
     BACKLOG.md) — STILL BLOCKED: the `Ai` port (`lib/ports/ai.ts`) still wraps `env.AI.run` with
     `@cf/...` ids; the binding-adapters REST `provider/model` switch is NOT landed. Confirm that
     dependency before picking it; otherwise it's blocked.

WATCH OUT (read CAVEATS — esp. the new THREAD-RESUME + ROUND-TRIPPING + PRE-EXISTING-FAILING-TEST):
  - Thread resume keys off `sessionStorage` per-tab; keep storage in sync on every threadId change
    (save / openThread set it, forgetThread clears it). `openThread` must stay a hoisted function
    declaration (the mount effect calls it above its definition).
  - The route runs through `streamChatRounds`, NOT `reframe`. Tool handlers emit EXACTLY ONE result
    per call. Pure modules never import @/db or @/. New tools → all THREE registries.
  - Always gate: CMS tsc + opennext build (dev server OFF first) + regen PM cms-bundle. The
    bundle:cms / bundle:selfcheck scripts live in **ProjectManager/package.json** (run from
    ProjectManager/, NOT repo root — root has no package.json).
  - Known failing test is a PAGE-BUILDER bug (Section grid CSS), NOT this goal. Don't "fix" it here.

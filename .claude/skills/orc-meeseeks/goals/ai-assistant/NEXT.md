# Note to the next Meeseeks (ai-assistant)

DONE: Slices 1–3 + Slice 4 (sub-slice 1 debug view, sub-slice 2 model picker, sub-slice 3
CONVERSATION HISTORY). History landed: D1 `chat_thread` table (migration 0005), pure
`lib/chat/history.ts`, `db/chat-history-store.ts`, REST `GET/POST/DELETE /api/chat/history`
(admin-only), `useChat` `seed`/`reset`, widget new-conversation + history panel that saves on the
busy→idle edge and reseeds on open. i18n EN/FI/ET. Gates green; cms-bundle regenerated.

PICK NEXT (Slice 4 is complete — pick the most valuable next slice toward the GOAL; suggestions,
re-rank as you see fit):
  1. **Component-target translation** — CAVEATS notes `/api/translate` 422s for `kind:"component"`
     by design (component text lives in block props at the page use-site). Wiring component
     translation would close that gap and unblock the page-builder AI-translate button for
     component-authored copy. Start in `db/translate-store.ts` `applyTranslation`.
  2. **Tool-call round-tripping** — today tools run and emit a `tool` event, but the result text is
     NOT fed back to the model for a follow-up turn (single-shot). aicms's `tool_executor` loops the
     result back so the model can chain (create_component → then create_page using it). Check whether
     `reframe.ts` already loops; if not, that's a meaty, high-value slice.
  3. **Persist+restore the CURRENT thread on widget mount** — history saves/loads work, but on a
     fresh page load the widget starts empty even if a thread was mid-flight. Could auto-load the most
     recent thread (or remember threadId in sessionStorage) so a refresh doesn't lose the convo.

WATCH OUT (read CAVEATS, esp. the new HISTORY + PRE-EXISTING-FAILING-TEST entries):
  - The full CMS suite is 416/417 — the ONE failure is a PAGE-BUILDER bug (Section grid CSS test
    not updated for the responsive-columns change, commit fc0b2e7). NOT this goal. Don't "fix" it here.
  - History SAVE is client-side on the busy→idle edge, NOT in the SSE route. Tool cards aren't stored.
    `useChat` exposes `seed`/`reset` — use them; don't add a parallel transcript setter.
  - Migrations: `drizzle-kit generate` from `CMS/`; new tables need `wrangler d1 migrations apply`.
  - Pure modules (history.ts, models.ts, tool-scopes.ts, read/write-tools.ts) NEVER import @/db or @/.
    Register any new tool in all THREE: KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT + route TOOL_BY_NAME.
  - Untrusted body fields (context, model, history id/body) are NEVER a hard 400 except a genuinely
    empty/garbage thread body — validate→default. Always gate: CMS tsc + opennext build (dev server
    OFF first) + regen PM cms-bundle (`npm run bundle:cms` then `bundle:selfcheck`) on any CMS change.

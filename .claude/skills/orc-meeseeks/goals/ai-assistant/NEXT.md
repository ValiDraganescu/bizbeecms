# Note to the next Meeseeks (ai-assistant)

DONE this run: **tool-call round-tripping**. The chat loop is now MULTI-TURN via `streamChatRounds`
(lib/chat/reframe.ts) — a turn's tool RESULTS are fed back to the model (assistant `tool_calls` +
`role:"tool"` messages) so it can chain (discover → act), bounded by maxRounds(4). Route switched
from `reframe` → `streamChatRounds`; `runTools` → `runToolsRound` (frames events AND returns
results). `reframe` kept for back-compat. Tests: reframe-rounds 4, reframe/sse 21. Gates green.

PICK NEXT (re-rank as you see fit toward the GOAL — page-aware assistant that builds the site):
  1. **Component-target translation** — CAVEATS notes `/api/translate` 422s for `kind:"component"`
     by design (component text lives in block props at the page use-site). Wiring component
     translation closes that gap + unblocks the page-builder AI-translate button for component copy.
     Start in `db/translate-store.ts` `applyTranslation`.
  2. **Persist+restore the CURRENT thread on widget mount** — history save/load works, but a fresh
     page load starts the widget empty even if a thread was mid-flight. Auto-load the most recent
     thread (or sessionStorage threadId) so a refresh doesn't lose the convo. Reuse `useChat` `seed`.
  3. **Tool-result UX in the transcript** — now that the model chains, a multi-round turn can emit
     several `tool` events interleaved with text. Check chat-conversation.tsx renders the sequence
     readably (tool cards between assistant text). Likely a small client polish, not a backend change.

WATCH OUT (read CAVEATS — esp. the new ROUND-TRIPPING + PRE-EXISTING-FAILING-TEST entries):
  - The route runs through `streamChatRounds`, NOT `reframe`. Tool handlers must emit EXACTLY ONE
    result per call (round-trip pairing depends on it). maxRounds(4) caps runaway loops.
  - Full CMS suite is 463/464 — the ONE fail is a PAGE-BUILDER bug (Section grid CSS test not updated
    for the responsive-columns change, commit fc0b2e7). NOT this goal. Don't "fix" it here.
  - Pure modules (reframe.ts, history.ts, models.ts, tool-scopes.ts, read/write-tools.ts) NEVER
    import @/db or @/. Register any new tool in all THREE: KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT +
    route TOOL_BY_NAME. Untrusted body fields → validate→default, never a hard 400.
  - Always gate: CMS tsc + opennext build (dev server OFF first — the aicms dev server on :3501 is a
    DIFFERENT repo, harmless) + regen PM cms-bundle (`npm run bundle:cms` then `bundle:selfcheck`).

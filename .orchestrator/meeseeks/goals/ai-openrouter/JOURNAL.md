# Journal — ai-openrouter
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 12:25 — Tracer: OpenRouterAi adapter + fake-fetch unit test (NOT wired in)
- **Status:** DONE
- **What I did:** Added `OpenRouterAi` class to `CMS/src/lib/ports/ai.ts` implementing the same `Ai`
  streaming contract as `CfAi`: POSTs `{ model, messages, stream: true, tools? }` to
  `OPENROUTER_CHAT_URL` (`https://openrouter.ai/api/v1/chat/completions`) with `Authorization: Bearer
  <key>`, returns `response.body` (raw SSE stream) unchanged, throws on non-ok / no-body. `fetch` is
  injected (defaults to global) so it's testable. `gatewayId` accepted for interface parity but unused
  (CF gateway slug doesn't apply to OpenRouter). Exported `OPENROUTER_CHAT_URL`. Rewrote the port's
  top doc comment (~lines 5-9) to record the OpenRouter reversal of the old "no second adapter" note.
  Wrote `CMS/scripts/openrouter-ai.test.mjs` (4 tests, fake fetch, no live key). NOT wired into
  `getAi()` — that's the next slice.
- **Verified:** `node --test scripts/openrouter-ai.test.mjs scripts/ai-port.test.mjs` → 8/8 pass.
  Did NOT run `opennextjs-cloudflare build` (deploy gate; reserved for the end-to-end slice; also the
  caveat warns against running it carelessly). Pre-existing unrelated failure: `ports-sole-reader.guard`
  flags `content-db.ts:39` reading `env.DB` — NOT my change (my code reads no env); predates this run.
- **Files:** `CMS/src/lib/ports/ai.ts`, `CMS/scripts/openrouter-ai.test.mjs`

## 2026-06-22 — Slice 2: select OpenRouter in getAi() + wire the secret
- **Did:** Made `getAi()` select OpenRouter by DEFAULT while keeping `CfAi` as fallback. Selection is
  ONE pure switch `pickSelection(env)` (also exported for testing): OpenRouter when
  `OPENROUTER_API_KEY` is a non-empty string → `new OpenRouterAi(key)`; else CfAi when the `AI` binding
  exists; else `null` (route → 503). `ai.ts` stays the sole env reader (now also reads
  `OPENROUTER_API_KEY`, not routes). Wired the secret end-to-end: declared empty placeholder
  `OPENROUTER_API_KEY` var in `CMS/wrangler.jsonc`; in the deployer added it to the `Env` type, the
  sandbox process env (`env.OPENROUTER_API_KEY ?? ""`), and the `wrangler deploy --var` list — exactly
  alongside the existing CMS_AUTH_SECRET/PM_ORIGIN pattern.
- **Verified:** added 3 selection tests to `openrouter-ai.test.mjs` → `node --test
  scripts/openrouter-ai.test.mjs` 7/7 pass. CMS `tsc --noEmit` 0 errors; deployer `tsc --noEmit -p
  tsconfig.json` 0 errors. Did NOT run `opennextjs-cloudflare build` (a parallel CMS worker owns the
  bundle/components + dev may be up; deploy gate reserved for slice 4). Did NOT run bundle:cms — this
  slice has no user strings (config/secret only), per task instructions.
- **Caveat for deploy:** the deployer must hold its own `OPENROUTER_API_KEY` secret
  (`wrangler secret put OPENROUTER_API_KEY` in deployer/) before a live deploy passes a real key down;
  absent => empty => CMS auto-falls-back to CfAi. No regression for un-keyed Sites.
- **Files:** `CMS/src/lib/ports/ai.ts`, `CMS/scripts/openrouter-ai.test.mjs`, `CMS/wrangler.jsonc`,
  `deployer/src/index.ts`

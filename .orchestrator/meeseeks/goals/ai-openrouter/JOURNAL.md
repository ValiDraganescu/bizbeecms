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

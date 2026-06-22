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

## 2026-06-22 — Slice 3: point the model catalog at OpenRouter
- **Did:** Swapped the catalog source from CF Workers-AI to OpenRouter, shape-only — the
  `CatalogModel` boundary + all pure helpers (`groupByProvider`/`sortByPrice`/`filterCatalog`/
  `isKnownModel`/`resolveModel`) and the picker/route consumers are untouched. In
  `CMS/src/lib/chat/models.ts`: `parseModelCatalog` now reads OpenRouter's `{ data: [{ id, name,
  pricing: { prompt } }] }` (tolerates a bare array + junk w/o `id`); `providerOf` takes the FIRST
  `vendor/model` segment (was the 2nd of `@cf/<vendor>/...`); `priceOf` reads `pricing.prompt`
  (USD/token string→number); `DEFAULT_MODEL = "openai/gpt-4o-mini"`; static `CHAT_MODELS` = 4
  OpenRouter chat models (openai/gpt-4o-mini, openai/gpt-4o, anthropic/claude-3.5-sonnet,
  google/gemini-flash-1.5). In `GET /api/chat/models`: `fetchLiveCatalog` now hits
  `https://openrouter.ai/api/v1/models` (public endpoint; sends `env.OPENROUTER_API_KEY` as Bearer
  when present, read via the SAME `getCloudflareContext` env boundary — still tries un-keyed if no
  CF context); kept the D1 cache + 12h lazy refresh + static fallback exactly. Chat route needed NO
  change: it already validates untrusted `model` via `resolveModel(cachedIds ∪ static) → DEFAULT_MODEL`,
  so it now resolves to OpenRouter ids automatically and never forwards arbitrary strings.
- **Verified:** rewrote `scripts/models.test.mjs` for the OpenRouter shape → `node --test
  scripts/models.test.mjs` 12/12 pass; AI port suites still green (`openrouter-ai` + `ai-port` 11/11).
  CMS `tsc --noEmit`: 0 errors in MY files (chat catalog). The only 2 tsc errors are pre-existing in
  the PARALLEL worker's `src/components/components/components-manager.tsx` (date typing) — not mine,
  out of my scope. Did NOT run `opennextjs-cloudflare build` (deploy gate; reserved for slice 4
  end-to-end + parallel worker owns the bundle/components & dev may be up). Did NOT run bundle:cms —
  catalog swap has zero new user strings.
- **Files:** `CMS/src/lib/chat/models.ts`, `CMS/src/app/api/chat/models/route.ts`,
  `CMS/scripts/models.test.mjs`

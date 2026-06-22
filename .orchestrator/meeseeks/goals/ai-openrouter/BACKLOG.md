# Backlog — ai-openrouter
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Ordered tracer-first: prove the adapter + test in isolation, then wire selection + secret, then swap the catalog, then verify end-to-end. Each is one Meeseeks slice.

- DONE: **Tracer — OpenRouter `Ai` adapter behind the existing port.** Add `OpenRouterAi` in `CMS/src/lib/ports/ai.ts` (or a sibling) implementing the same streaming OpenAI-compatible contract as `CfAi`, calling `https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer ${OPENROUTER_API_KEY}` (preserve `stream: true` + the `tools` array, return the raw upstream SSE stream). Update the port's "no second adapter / CF-native" doc comment (~lines 6–9) to record the OpenRouter decision. Unit-test it against a FAKE `fetch` like `CMS/scripts/ai-port.test.mjs` — no live key. Do NOT wire it in yet.
- DONE: **Select the provider in `getAi()` + wire the secret.** `getAi()` now uses pure `pickSelection(env)` — OpenRouter when `OPENROUTER_API_KEY` non-empty (DEFAULT), else CfAi when `AI` binding present, else null→503. `OPENROUTER_API_KEY` declared (empty placeholder) in `CMS/wrangler.jsonc` and injected per-Site by the deployer (`deployer/src/index.ts`: Env type + process env + `--var OPENROUTER_API_KEY:$OPENROUTER_API_KEY`, alongside CMS_AUTH_SECRET/PM_ORIGIN). 3 new selection tests in `openrouter-ai.test.mjs` (7 total green); CMS+deployer tsc 0. Deployer needs `wrangler secret put OPENROUTER_API_KEY` before a live deploy.
- TODO: **Point the model catalog at OpenRouter.** Update `CMS/src/lib/chat/models.ts` + `GET /api/chat/models` so the catalog is fetched from OpenRouter's `/api/v1/models` instead of the CF list-models API; keep the D1 cache + lazy refresh + static fallback pattern; set `DEFAULT_MODEL` to an OpenRouter id. Keep the chat route's untrusted-`model` validation working against the new catalog. Update `models.test.mjs` for the new shape.
- TODO: **Verify end-to-end.** `npx opennextjs-cloudflare build` green (dev OFF first); chat streams from OpenRouter with tool-calls still round-tripping; model picker shows the OpenRouter catalog; both adapter unit tests + the full CMS test suite green. Record the manual chat-stream check in the journal (live deploy is the only non-codeable bit).

# Caveats — ai-openrouter
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- The `Ai` port (`CMS/src/lib/ports/ai.ts`) is the ONLY place that reads `env.AI`. Keep that property:
  the OpenRouter adapter reads `OPENROUTER_API_KEY` via the same boundary, not from scattered code.
- `CfAi` is the existing Cloudflare adapter — KEEP it as a fallback. The port exists to make providers
  swappable; deleting the first plug defeats the point.
- The chat route's `model` field is UNTRUSTED and must NEVER 400 — validate against the cached catalog
  ids (or static fallback), fall back to `DEFAULT_MODEL`. Don't forward arbitrary strings upstream.
- `npx opennextjs-cloudflare build` is the deploy gate. NEVER run it while `npm run dev` (3601/3602) is
  running — it corrupts `.next`. Stop dev first.
- OpenRouter is OpenAI-compatible but expects a real key; unit-test the adapter against a FAKE `fetch`
  (see archived binding-adapters' `scripts/ai-port.test.mjs`) — no live calls in tests.
- Prior context lives in `goals/archive/ai-assistant/` and `goals/archive/binding-adapters/` — read
  their JOURNAL/CAVEATS; this goal continues that work, doesn't restart it.
- `OpenRouterAi` (in `ai.ts`) takes `fetch` as a constructor arg (defaults to global) so the unit test
  can drive a fake — DON'T hardcode global `fetch` if you refactor; the test depends on injection.
- It returns `response.body` (the SSE stream) directly. OpenRouter is OpenAI-compatible so this is the
  same delta+tool-call SSE shape the route's reframer already handles — no extra translation needed.
- Pre-existing, NOT ours: `scripts/ports-sole-reader.guard.test.mjs` FAILS on `content-db.ts:39`
  reading `env.DB`. Unrelated to the AI port; don't chase it as part of this goal.
- The model id for OpenRouter is provider-prefixed (e.g. `openai/gpt-4o-mini`), NOT the `@cf/...` form.
  Remember when setting `DEFAULT_MODEL` in the catalog slice.
- Provider selection is by KEY PRESENCE (`pickSelection` in `ai.ts`): a non-empty `OPENROUTER_API_KEY`
  → OpenRouter, else CfAi, else null→503. An EMPTY string is NOT a key (falls back to CfAi) — the
  `CMS/wrangler.jsonc` placeholder is intentionally empty so un-keyed Sites still use CF, no regression.
- For OpenRouter to actually be active on a deployed CMS, the DEPLOYER worker must hold its own
  `OPENROUTER_API_KEY` secret (`wrangler secret put OPENROUTER_API_KEY` in `deployer/`). The deployer
  passes it down via `--var`; without it the var is "" and the CMS silently uses CfAi.
- CATALOG SHAPE (slice 3): `parseModelCatalog` now expects OpenRouter's `{ data: [...] }` (id, name,
  pricing.prompt) — NOT the CF `{ result: [...] }` (name, task, properties[]). `providerOf` takes the
  FIRST `vendor/model` segment now (was the 2nd of `@cf/...`). If you ever re-enable CfAi's catalog
  you'd need a per-provider parser; don't assume one shape fits both.
- `GET /api/chat/models` hits OpenRouter's PUBLIC `/api/v1/models` (no key strictly required) — it
  works un-keyed in local dev. The key is sent only for attribution. So the picker shows the live
  OpenRouter list even before the deployer secret is set; only actual chat completions need the key.
- `CMS/src/app/api/translate/route.ts` STILL has its own hardcoded `@cf/...` DEFAULT_MODEL and calls
  CF directly — it's NOT part of the assistant catalog and was left as-is (out of this goal's scope).
  If translate should also move to OpenRouter, that's a separate task.

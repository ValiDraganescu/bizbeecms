# Backlog — binding-adapters
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- DONE (2026-06-18): Define the `Storage` port over `CMS/src/db/asset-store.ts` (only the R2 methods
  actually called) + a `CfStorage` adapter wrapping `env.MEDIA`; route asset-store callers through it.
  → `CMS/src/lib/ports/storage.ts` + `scripts/storage-port.test.mjs`. `getStorage()` is now the sole
  reader of `env.MEDIA`. Build + 223 tests green.
- DONE (2026-06-18): `Db` port over the drizzle factory → `CMS/src/lib/ports/db.ts` (`Db` type +
  `cfDb` adapter + `getDb()`, the SOLE `env.DB` reader). `src/db/index.ts` re-exports it so every
  `@/db` caller is unchanged. Test `scripts/db-port.test.mjs` (real schema → real SQL). 225 green + build.
- DONE (2026-06-18): `Ai` port over `env.AI.run` → `CMS/src/lib/ports/ai.ts` (`Ai` iface w/ one
  `chat(messages, {model,tools,gatewayId})` method, `CfAi` adapter wrapping `ai.run`, `getAi()` =
  SOLE `env.AI` reader, `getGatewayId()` = sole `AI_GATEWAY` reader). Chat route routed through it;
  streaming + OpenAI shape + AI Gateway preserved. `scripts/ai-port.test.mjs`. 227 green + build.
- DONE (2026-06-18): Unified adapter factory `CMS/src/lib/ports/index.ts` — `getPorts()` reads the CF
  context ONCE → `{ db, storage, ai }`, composing the existing `cfDb`/`CfStorage`/`CfAi` adapters.
  Testable `cfPorts(env)` seam; preserves getStorage's throw-on-missing-MEDIA + getAi's `ai|null`.
  Test `scripts/ports-factory.test.mjs` (4). 231 green + build.
- TODO: One unit test exercising a CMS module against a mocked port (prove the seam; honest assertions).
- TODO: Verify zero behavior change — `npx opennextjs-cloudflare build` green + existing tests pass.

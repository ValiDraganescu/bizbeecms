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
- DONE (2026-06-18): One CMS module against a MOCKED Db port — `scripts/page-store.test.mjs` (5)
  drives the REAL `upsertPage` via a new `injectedDb?: Db` seam against the REAL `cfDb` over an
  in-memory `node:sqlite` fake D1 (real SQL, real `page` table). Honest assertions on returned
  `{action,slug}`/errors + persisted rows: create, update-in-place (no dup), parentSlug→id resolution,
  missing-parent rejection, same-slug-different-parent. 236 green + build. Proves the seam pays off.
- DONE (2026-06-18): Zero-behavior-change verified — `npx opennextjs-cloudflare build` green + 236
  tests pass. binding-adapters CORE SCOPE COMPLETE (3 ports + unified factory + mocked-port unit test).
- DONE (2026-06-18): 2nd mocked-Db store test — `scripts/settings-store.test.mjs` (5) drives REAL
  `getContentLocales`/`setContentLocales` via `injectedDb?: Db` seam over `cfDb`+`node:sqlite` fake D1.
  Covers safe-default, normalize/persist/read round-trip, key-keyed update-in-place, + defensive
  bad-JSON & wrong-shape fallbacks. 241 green + build.
- DONE (2026-06-18): GREP-GUARD freezing the sole-reader invariant — `scripts/ports-sole-reader.guard.test.mjs`
  (3) scans `CMS/src`, FAILS if any real `env.DB|MEDIA|AI` BINDING read appears OUTSIDE
  `CMS/src/lib/ports/`. Lexer-lite comment-strip (chat-route JSDoc mentions env.AI), `\b`-bounded
  matcher excludes config vars (AI_GATEWAY/PM_ORIGIN/SITE_ID). Passes now; proven to fail on a stray
  `env.DB` read (injected→red, reverted→green). 244 green (+3) + build. Test-only, no app code.

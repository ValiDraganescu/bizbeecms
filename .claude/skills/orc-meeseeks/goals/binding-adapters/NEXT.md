# Note to the next Meeseeks (binding-adapters)
DONE so far: all THREE ports — `Storage` (`lib/ports/storage.ts`), `Db`
(`lib/ports/db.ts`), `Ai` (`lib/ports/ai.ts`). Each has a CF adapter + a `getX()`
factory that is the SOLE reader of its binding (`env.MEDIA` / `env.DB` / `env.AI`).
Each has a real-adapter node --test. 227 tests green + build green.

Take the next TODO: the **unified adapter factory** (`env → { db, storage, ai }`).
- Goal: ONE place that reads the Cloudflare env and hands back all three ports, so
  the `getCloudflareContext` call is made once. Likely `lib/ports/index.ts` with a
  `getPorts()` (or `getBindings()`) that returns `{ db, storage, ai }`.
- KEEP zero behavior change. The individual `getDb/getStorage/getAi` can stay as
  thin wrappers over the unified factory, OR the factory composes them — your call,
  but don't break existing `@/db` / asset-store / chat-route callers.
- Note: `getAi()` returns `Ai | null` (binding may be unbound) — the unified
  factory must preserve that nullability, don't force-non-null.
- Then the LAST TODO: one CMS-module-against-a-mocked-port unit test (prove the
  seam earns its keep — honest assertions, no tautological mocks). A good candidate:
  a `*-store.ts` module given a fake `Db`, asserting real query behavior.

GOTCHAS (CAVEATS.md): `.ts` extension on relative imports node --test loads; no TS
parameter properties (explicit field + assignment); `ChatMessage` is declared 3x
(leave it); drizzle fake D1 needs `.raw()` on the prepared stmt.
Gate: `npm test` (227+ green) + `npx opennextjs-cloudflare build` (NEVER while dev runs).

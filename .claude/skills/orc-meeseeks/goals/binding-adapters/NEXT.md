# Note to the next Meeseeks (binding-adapters)
DONE so far: all THREE ports — `Storage`/`Db`/`Ai` in `lib/ports/{storage,db,ai}.ts`,
each with a CF adapter + a `getX()` factory (sole reader of its binding) + a
real-adapter node --test. PLUS the **unified adapter factory** `lib/ports/index.ts`
— `getPorts()` reads the CF context ONCE → `{ db, storage, ai }`, composing the
three adapters; `cfPorts(env)` is the testable seam. 231 tests green + build green.

Take the next (and last queued) TODO: **one CMS-module-against-a-mocked-port unit
test** — prove the seam earns its keep with HONEST assertions (no tautological
mocks, no `toHaveBeenCalledWith` on internals; assert real behavior).
- Best candidate: a `*-store.ts` module (e.g. `src/db/page-store.ts` /
  `component-store.ts` / `settings-store.ts`) given a FAKE `Db` (drizzle over an
  in-memory/fake D1), asserting the real query behavior — e.g. publish-status
  filtering, slug lookup, per-locale SEO — not "the db was called".
- These store modules currently import the concrete `getDb()`. To inject a fake
  cleanly you may need to let the function take an optional `db?: Db` param
  defaulting to `getDb()` (a tiny, zero-behavior-change seam — the prod path is
  unchanged). Check how the store is shaped first; do the SMALLEST injection edit.
- The fake `Db` is a drizzle client over a fake `D1Database`: remember selects call
  `stmt.bind(...).raw()` (rows-as-arrays), inserts `.run()` — see `db-port.test.mjs`.

After that, the backlog's last "verify zero behavior change" TODO is really a
checklist every run already satisfies (build + tests). Consider it covered; if you
want a TODO, invent the next valuable seam slice toward GOAL.md.

GOTCHAS (CAVEATS.md, read them): `npx opennextjs-cloudflare build` RESETS the shell
cwd — use absolute paths for memory writes after a build; `.ts` extension on
relative imports node --test loads; no TS parameter properties; `ChatMessage` is 3x
(leave it). Gate: `npm test` (231+ green) + `npx opennextjs-cloudflare build`
(NEVER while dev runs on 3601/3602).

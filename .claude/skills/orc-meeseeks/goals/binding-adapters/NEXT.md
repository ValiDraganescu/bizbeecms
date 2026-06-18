# Note to the next Meeseeks (binding-adapters)

**CORE SCOPE COMPLETE** + sole-reader invariant FROZEN BY CI
(`scripts/ports-sole-reader.guard.test.mjs`). **258 tests green + build green.**

Mocked-port store tests now cover FOUR modules and BOTH bindings:
- **Db**: `page-store` (upsertPage), `settings-store` (content-locales),
  `component-store` (upsert/import/missing-names).
- **Storage+Db**: `asset-store` (put/list/get/delete) — NEW this run, via
  `injectedStorage?: Storage` + `injectedDb?: Db` seams + in-memory fake Storage Map.

Do NOT redo anything in JOURNAL. Do NOT build a 2nd (Postgres/Vercel) adapter (CF-only,
top CAVEAT). Per skill rule 3, INVENT the next valuable seam slice. Candidates, rough
order of value:

1. **`settings-store.ts` still has UNCOVERED logic** — `getThemeOverrides`/`setThemeOverrides`
   + `getSiteIdentity`/`setSiteIdentity` (only content-locales is tested). Extend the existing
   `settings-store.test.mjs`. Check for real branching first (upsert-by-key, JSON round-trip,
   defaults) — if thin, lower value.
2. **`translate-store.ts`** — not yet tested; check for real logic (insert/update of
   translations, missing-key handling) before committing.
3. **The chat-route / Ai-port path through a MODULE** (not just the `ai-port.test.mjs` adapter).
   If a route/lib has real logic over the `Ai` port (tool dispatch, message assembly), a
   mocked-Ai business-module test would mirror the Db/Storage ones. Needs an `injectedAi?: Ai` seam.
   Mind the streaming contract (top CAVEAT) — don't collapse it.

RECIPE (CAVEATS has the full version): add `injected<Port>?: Port` param(s)
(`injected ?? await getX()`); switch the module's value imports `./index`/`@/...` → relative
`../lib/ports/<name>.ts` (node --test can't resolve tsconfig paths/barrels; re-exports = zero
behavior change). For Db use a `node:sqlite` fake D1 (real migration DDL + prepare→bind→
{run,all,raw}; raw()=rows-as-arrays via `stmt.columns()`). For Storage use an in-memory Map
matching put/get/delete. Assert returned + persisted/stored data, never "was-called". Keep all
new injection params OPTIONAL so every existing caller is untouched.

GATE every run: `npm test` (258+ green) + `npx opennextjs-cloudflare build` (NEVER while dev
runs on 3601/3602; `lsof -ti:3601` first. Build RESETS cwd → use ABSOLUTE paths for memory writes).

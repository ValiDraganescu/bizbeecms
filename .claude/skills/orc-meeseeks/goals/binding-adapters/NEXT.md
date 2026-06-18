# Note to the next Meeseeks (binding-adapters)

**CORE SCOPE COMPLETE** + sole-reader invariant FROZEN BY CI
(`scripts/ports-sole-reader.guard.test.mjs`). 252 tests green + build green.

Mocked-Db-port store tests now cover THREE stores: `page-store` (upsertPage),
`settings-store` (content-locales), and `component-store` (upsertComponent /
upsertImportedComponent / missingComponentNames — insert-vs-update by UNIQUE name,
props_schema only on the import path). All via the `injectedDb?: Db` seam + node:sqlite
fake D1.

Do NOT redo anything in JOURNAL. Do NOT build a 2nd (Postgres/Vercel) adapter (CF-only,
top CAVEAT). Per skill rule 3, INVENT the next valuable seam slice. Candidates, rough
order of value:

1. **`settings-store.ts` still has UNCOVERED logic** — `getThemeOverrides`/`setThemeOverrides`
   + `getSiteIdentity`/`setSiteIdentity` (only content-locales is tested). Extend the
   existing `settings-store.test.mjs`. Check for real branching first (upsert-by-key,
   JSON round-trip, defaults) — if it's thin, lower value.
2. **`translate-store.ts`** — not yet tested; check for real logic (insert/update of
   translations, missing-key handling) before committing to it.
3. **A Storage-port mocked test against a CMS *module*** (not just the adapter). The asset
   gallery upload/serve path through `getStorage()`/`CfStorage` only has the adapter-level
   `storage-port.test.mjs`. If a store/route has real logic over Storage, a mocked-Storage
   business-module test would mirror the Db ones. Needs a `Storage` injection seam on that
   module.

RECIPE (CAVEATS has the full version): add `injectedDb?: Db` param (`injectedDb ?? await
getDb()`); ensure the store's runtime VALUE imports are relative `.ts` (switch `./index`/`@/`
to `../lib/ports/db.ts` etc. — node --test can't resolve tsconfig paths; index just re-exports
so zero behavior change); build a fake D1 with `node:sqlite` (real migration DDL + prepare→bind→
{run,all,raw}; raw()=rows-as-arrays via `stmt.columns()`); assert returned + persisted data,
never "was-called". Compute expected shapes from REAL helpers, don't hardcode.

GATE every run: `npm test` (252+ green) + `npx opennextjs-cloudflare build` (NEVER while dev
runs on 3601/3602; `lsof -ti:3601` first. Build RESETS cwd → use ABSOLUTE paths for memory writes).

# Note to the next Meeseeks (binding-adapters)

**CORE SCOPE COMPLETE** + the sole-reader invariant is now **FROZEN BY CI**:
`scripts/ports-sole-reader.guard.test.mjs` scans `CMS/src` and FAILS if any real
`env.DB|MEDIA|AI` BINDING read appears outside `CMS/src/lib/ports/`. Passes now; proven to
fail on a stray read. 244 tests green + build green.

Also: TWO mocked-port store tests prove the seam pays off — `page-store.test.mjs` (upsertPage)
and `settings-store.test.mjs` (content-locales).

Do NOT redo anything in JOURNAL. Do NOT build a 2nd (Postgres/Vercel) adapter (CF-only, top
CAVEAT). The guard now protects the invariant, so the "freeze the invariant" slice is DONE too.
Per skill rule 3, INVENT the next valuable seam slice. Candidates, rough order of value:

1. **More mocked-port store tests** — same recipe (CAVEATS has the full version). Best remaining:
   - `component-store.ts` — `upsertComponent`/`upsertImportedComponent` (insert-vs-update by UNIQUE
     `name`; `propsSchema` persisted only on the import path) + `missingComponentNames` (inArray
     subset). Genuine branching. Needs `injectedDb?: Db` seam + relative `.ts` value imports.
     DDL: migrations/0000 (`component` table, UNIQUE on name).
   - `settings-store.ts` still has `getThemeOverrides`/`setThemeOverrides` + `getSiteIdentity`/
     `setSiteIdentity` UNCOVERED (only content-locales tested) — extend the existing test file.
     Lower novelty.
   - `translate-store.ts` — check for real logic first.
2. **A Storage-port mocked test against a CMS module** — page-store/settings tests cover Db; the
   asset gallery upload/serve path through `getStorage()`/`CfStorage` has only the adapter-level
   test (`storage-port.test.mjs`), not a business-module test. If there's a store/route with real
   logic over Storage, a mocked-Storage test would mirror the Db ones.

RECIPE (CAVEATS has it): add `injectedDb?: Db` param (`injectedDb ?? await getDb()`), import db port
+ value deps via relative `.ts`, build fake D1 with `node:sqlite` (DDL + prepare→bind→{run,all,raw},
raw()=rows-as-arrays via `stmt.columns()`), assert returned + persisted data, never "was-called".
Compute expected shapes from REAL normalize helpers, don't hardcode.

GATE every run: `npm test` (244+ green) + `npx opennextjs-cloudflare build` (NEVER while dev runs on
3601/3602; check `lsof -ti:3601` first. The build can RESET cwd → use ABSOLUTE paths for memory writes).

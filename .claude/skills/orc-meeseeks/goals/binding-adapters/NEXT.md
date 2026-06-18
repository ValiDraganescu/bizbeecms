# Note to the next Meeseeks (binding-adapters)

**CORE SCOPE IS COMPLETE** + now TWO mocked-port store tests prove the seam pays off:
`page-store.test.mjs` (upsertPage) and `settings-store.test.mjs` (content-locales get/set, JSON
round-trip + defensive bad-JSON/wrong-shape fallback). 241 tests green + build green.

**Confirmed this run:** NO `env.DB|MEDIA|AI` read exists OUTSIDE the port factories — the sole-reader
invariant holds. (admin/layout + auth/guard read CONFIG vars PM_ORIGIN/CMS_AUTH_SECRET/SITE_ID, not the
bindings — out of scope, see CAVEATS. Don't build a Config port.) So the "higher-value sole-reader fix"
slice is NOT available; only the invent-the-next-test-slice path remains.

Do NOT redo anything in JOURNAL. Do NOT build a 2nd (Postgres/Vercel) adapter (CF-only, top CAVEAT).
Per skill rule 3, INVENT the next valuable seam slice. Candidates, rough order of value:

1. **More mocked-port store tests** — same recipe (CAVEATS has it). Remaining stores with real logic:
   - `component-store.ts` — `upsertComponent`/`upsertImportedComponent` (insert-vs-update by UNIQUE
     `name`; `propsSchema` persisted only on the import path) + `missingComponentNames` (inArray subset).
     Genuine branching worth asserting; needs the `injectedDb?: Db` seam + relative `.ts` value imports.
     DDL: migrations/0000 (`component` table, UNIQUE on name).
   - `settings-store.ts` still has `getThemeOverrides`/`setThemeOverrides` + `getSiteIdentity`/
     `setSiteIdentity` UNCOVERED (only content-locales is tested) — same normalize+round-trip+bad-JSON
     shape, would extend the existing test file. Lower novelty than component-store.
   - `translate-store.ts` — check it for real logic first.
2. **Lint/grep guard test**: assert no `CMS/src` module outside `lib/ports/` reads `env.DB|MEDIA|AI`
   directly (use the SPECIFIC binding pattern, NOT all `getCloudflareContext` — see new CAVEAT). Cheap,
   freezes the invariant going forward.

RECIPE (CAVEATS has the full version): add `injectedDb?: Db` param (`injectedDb ?? await getDb()`),
import db port + value deps via relative `.ts`, build fake D1 with `node:sqlite` (DDL + prepare→bind→
{run,all,raw}, raw()=rows-as-arrays via `stmt.columns()`), assert returned + persisted data, never
"was-called". Compute expected shapes from the REAL normalize helpers, don't hardcode.

GATE every run: `npm test` (241+ green) + `npx opennextjs-cloudflare build` (NEVER while dev runs on
3601/3602; the build RESETS cwd → use ABSOLUTE paths for memory writes after it).

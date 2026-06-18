# Note to the next Meeseeks (binding-adapters)

**P0 BUG FIXED this run** — CMS container deploy build (`Cannot find name 'R2ObjectBody'`).
Root cause was `CMS/cloudflare-env.d.ts` being .gitignored (it carries BOTH Workers global types
AND the `CloudflareEnv` env interface) → a fresh container clone had neither. Fix: (1)
`@cloudflare/workers-types` CMS devDep + pinned tsconfig `compilerOptions.types`; (2) `npm run
cf-typegen` step added to the deployer container build script BEFORE the opennext build. Verified
the EXACT container path green (deleted env file → `npm ci` → cf-typegen → build). BACKLOG bug = DONE.
**No open bugs remain.** CMS `npm test` 264 green.

**CORE GOAL still fully delivered + CI-locked** (3 ports Db/Storage/Ai + `getPorts()` factory +
sole-reader guard). Do NOT redo JOURNAL work; do NOT build a 2nd (Postgres/Vercel) adapter (CF-only,
top CAVEAT). Per skill rule 3, INVENT the next valuable seam slice. Candidates, rough order of value:

1. **settings-store.ts uncovered logic** — `getThemeOverrides`/`setThemeOverrides` +
   `getSiteIdentity`/`setSiteIdentity` (only content-locales is tested). Extend
   `settings-store.test.mjs` (already has injectedDb seam + node:sqlite fake D1). Check for real
   branching first (upsert-by-key, JSON round-trip, defaults) — if thin, lower value.
2. **translate-store.ts** — `applyTranslation` not yet unit-tested via a mocked Db. Add `injectedDb?`
   seam; assert insert/update of translations + missing-key handling.
3. **Chat tool HANDLERS** (route.ts handleCreateComponent/handleCreatePage/handleTranslate/
   handleListAssets) — CF-coupled inside route.ts. If worth proving, extract the per-tool dispatch
   into a pure node-loadable module (like reframe) taking the stores injected, then test ok/false
   framing + validation. The `runTools` loop is the extraction boundary.

RECIPE (CAVEATS has full versions): STORES get `injected<Port>?: Port` param(s)
(`injected ?? await getX()`); switch the module's value imports `./index`/`@/...` → relative
`../lib/ports/<name>.ts` (node --test can't resolve tsconfig paths/barrels; re-exports = zero
behavior change). Db fake = `node:sqlite` (real DDL + prepare→bind→{run,all,raw}; raw()=rows-as-arrays
via `stmt.columns()`). Storage fake = in-memory Map. Ai fake = ReadableStream of SSE byte pieces
(split mid-line). Assert returned + persisted/stored data, never "was-called". Keep params OPTIONAL.

GATE every run: `npm test` (264+ green) + `npx opennextjs-cloudflare build` (dev OFF — `lsof -ti:3601`
first; build RESETS cwd → ABSOLUTE paths for memory writes). **If you touch CMS types/bindings, repro
the CONTAINER: `rm -f CMS/cloudflare-env.d.ts` before `npm ci`+cf-typegen+build — a warm copy hides
the gitignored-file bug.**

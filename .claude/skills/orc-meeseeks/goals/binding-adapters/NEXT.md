# Note to the next Meeseeks (binding-adapters)

**TRIFECTA COMPLETE** — all 3 ports (Db / Storage / Ai) now proven against mocked
ports IN A BUSINESS MODULE, + unified `getPorts()` factory + sole-reader invariant
FROZEN BY CI (`scripts/ports-sole-reader.guard.test.mjs`). **264 tests green + build green.**

Mocked-port business-module tests now cover:
- **Db**: page-store (upsertPage), settings-store (content-locales), component-store
  (upsert/import/missing-names).
- **Storage+Db**: asset-store (put/list/get/delete).
- **Ai (STREAMING)**: `lib/chat/reframe.ts` consumed via `scripts/reframe.test.mjs` — a fake
  Ai-port ReadableStream, cross-chunk token assembly, streamed tool-call arg reassembly, dispatch.

Do NOT redo anything in JOURNAL. Do NOT build a 2nd (Postgres/Vercel) adapter (CF-only,
top CAVEAT). The CORE GOAL is fully delivered + locked by CI. Per skill rule 3, INVENT the
next valuable seam slice. Candidates, rough order of value:

1. **settings-store.ts still has UNCOVERED logic** — `getThemeOverrides`/`setThemeOverrides`
   + `getSiteIdentity`/`setSiteIdentity` (only content-locales is tested). Extend
   `settings-store.test.mjs` (already has the injectedDb seam + node:sqlite fake D1 wired).
   Check for real branching first (upsert-by-key, JSON round-trip, defaults) — if thin, lower value.
2. **translate-store.ts** — `applyTranslation` not yet unit-tested via a mocked Db. Real logic
   (insert/update of translations, missing-key handling) before committing. Add `injectedDb?` seam.
3. **The chat tool HANDLERS** (`route.ts` handleCreateComponent/handleCreatePage/handleTranslate/
   handleListAssets) dispatch + frame `tool` events but are inside route.ts (CF-coupled, not
   node-loadable). If worth proving, extract the per-tool dispatch into a pure node-loadable module
   (like reframe) taking the stores as injected deps, then test the ok/false framing + validation
   wiring. The `runTools` loop is the obvious extraction boundary.

RECIPE (CAVEATS has full versions): for STORES add `injected<Port>?: Port` param(s)
(`injected ?? await getX()`); switch the module's value imports `./index`/`@/...` → relative
`../lib/ports/<name>.ts` (node --test can't resolve tsconfig paths/barrels; re-exports = zero
behavior change). Db fake = `node:sqlite` (real migration DDL + prepare→bind→{run,all,raw};
raw()=rows-as-arrays via `stmt.columns()`). Storage fake = in-memory Map (put/get/delete). Ai
fake = a ReadableStream emitting SSE byte pieces (split mid-line to exercise streaming). Assert
returned + persisted/stored/re-framed data, never "was-called". Keep all injection params OPTIONAL
so every existing caller is untouched.

GATE every run: `npm test` (264+ green) + `npx opennextjs-cloudflare build` (NEVER while dev
runs on 3601/3602; `lsof -ti:3601` first. Build RESETS cwd → use ABSOLUTE paths for memory writes).

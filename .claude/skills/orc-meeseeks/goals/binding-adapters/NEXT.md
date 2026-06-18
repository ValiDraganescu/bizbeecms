# Note to the next Meeseeks (binding-adapters)

**CORE SCOPE IS COMPLETE.** Everything GOAL.md asked for is DONE + build-green (236 tests):
- 3 ports: `Db`/`Storage`/`Ai` in `lib/ports/{db,storage,ai}.ts`, each with a CF adapter + a
  `getX()` factory that is the SOLE reader of its binding.
- Unified factory `lib/ports/index.ts` — `getPorts()` reads CF context ONCE → `{db,storage,ai}`.
- The seam's payoff: `scripts/page-store.test.mjs` — real `upsertPage` business logic against a
  MOCKED Db (real `cfDb` over an in-memory `node:sqlite` fake D1), honest assertions only.

There are NO queued TODOs left. Do NOT redo the above (all DONE in JOURNAL). Do NOT build a second
(Postgres/Vercel) adapter — main is CF-only (top CAVEAT). Per skill rule 3, INVENT the next valuable
seam slice toward GOAL.md. Candidates, in rough order of value:

1. **Wire callers through `getPorts()`** where a route/page touches more than one binding at once —
   replaces scattered `getDb()`/`getStorage()`/`getAi()` reads with the single composed factory the
   goal envisions. Find such a spot first (`grep -rn "getDb\|getStorage\|getAi" CMS/src/app`); if none
   uses two bindings together, skip — don't force it (zero-behavior-change refactor only).
2. **More mocked-port store tests** — same recipe as `page-store.test.mjs` for another `*-store.ts`
   with real branching: `component-store.ts` (upsert by unique name) or `settings-store.ts`
   (get/set + JSON round-trip) or `translate-store.ts`. Each needs the `injectedDb?` seam + relative
   value imports (see CAVEATS recipe). Pick ONE with genuine logic worth asserting.
3. **Lint/grep guard**: a tiny test asserting no `CMS/src` module outside `lib/ports/` reads
   `env.DB|MEDIA|AI` directly (enforces "the factory is the only env reader" invariant going forward).

RECIPE for store tests (CAVEATS has the full version): add `injectedDb?: Db` param
(`injectedDb ?? await getDb()`); switch the module's runtime VALUE `@/` imports to relative `.ts`;
build the fake D1 with `node:sqlite` (`DatabaseSync(":memory:")` + migration DDL + shim
`prepare→bind→{run,all,raw}`, raw() = rows-as-arrays via `stmt.columns()`); assert returned + persisted
data, never "was-called".

Gate every run: `npm test` (236+ green) + `npx opennextjs-cloudflare build` (NEVER while dev runs on
3601/3602; the build RESETS cwd so use absolute paths for memory writes after it).

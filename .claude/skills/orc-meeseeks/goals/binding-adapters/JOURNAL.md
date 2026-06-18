# Journal — binding-adapters
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-18 18:41 — Storage port + CfStorage adapter
- **Status:** DONE
- **What I did:** Created `CMS/src/lib/ports/storage.ts` — the `Storage` interface
  (only the 3 R2 methods asset-store uses: `put`/`get`/`delete`), a `CfStorage`
  adapter wrapping an `R2Bucket` (translates `{contentType}` → R2 `httpMetadata`
  exactly as before), and `getStorage()` — now the SOLE reader of `env.MEDIA`.
  Routed `asset-store.ts` through `getStorage()`; deleted its local `getBucket()`
  and the `getCloudflareContext` import (moved into the port). Zero behavior change.
- **Verified:** New `scripts/storage-port.test.mjs` (4 tests) drives the REAL
  imported `CfStorage` against an in-memory fake R2 bucket, asserting what R2
  actually receives (httpMetadata translation + get/delete pass-through) — not
  tautological "was-called". Full suite green (223 tests). Deploy gate
  `npx opennextjs-cloudflare build` succeeded.
- **Files:** `CMS/src/lib/ports/storage.ts` (new), `CMS/src/db/asset-store.ts`,
  `CMS/scripts/storage-port.test.mjs` (new)

## 2026-06-18 18:48 — Ai port + CfAi adapter
- **Status:** DONE
- **What I did:** Created `CMS/src/lib/ports/ai.ts` — the `Ai` port. The chat
  route was the only real `env.AI` reader (the `lib/chat/*` mentions are just doc
  comments). Port = one method `chat(messages, {model, tools?, gatewayId?})` →
  `ReadableStream`; `CfAi` wraps `ai.run(model, {messages, stream:true, tools},
  {gateway:{id}})` 1:1 — streaming + OpenAI message/tool shape + AI Gateway all
  preserved. `getAi()` is the SOLE `env.AI` reader (returns null when unbound, so
  the route still answers 503 not 500); `getGatewayId()` is the sole `AI_GATEWAY`
  reader (moved the in-route `gatewayId()` helper into the port). Route now calls
  `await ai.chat(...)`, dropping the `getCloudflareContext` import + the
  `Parameters<Ai["run"]>` casts. Extract only, zero behavior change.
- **Verified:** New `scripts/ai-port.test.mjs` (2 tests) drives the REAL imported
  `CfAi` against a fake `env.AI` binding, asserting the real call shape (model +
  `{messages, stream:true, tools}` + `{gateway:{id}}`) AND that the upstream
  stream is returned as-is (sentinel identity check — NOT buffered), plus that
  tools/gateway are omitted when absent. Full suite 227 green (was 225). Deploy
  gate `npx opennextjs-cloudflare build` succeeded.
- **Files:** `CMS/src/lib/ports/ai.ts` (new), `CMS/src/app/api/chat/route.ts`,
  `CMS/scripts/ai-port.test.mjs` (new)

## 2026-06-18 — Db port + cfDb adapter
- **Status:** DONE
- **What I did:** Created `CMS/src/lib/ports/db.ts` — the `Db` port. Drizzle is
  already the layer, so the port is thin: `Db` = the drizzle-D1 client type,
  `cfDb(d1)` = the exact `drizzle(env.DB, {schema})` construction, and `getDb()`
  is now the SOLE reader of `env.DB`. Re-homed `src/db/index.ts` to a 2-line
  re-export from the port, so all ~6 `@/db` caller modules (page/component/
  settings/translate-store, `[[...slug]]/page.tsx`) are UNCHANGED. Extract only,
  zero behavior change.
- **Verified:** New `scripts/db-port.test.mjs` (2 tests) drives the REAL imported
  `cfDb` against an in-memory fake D1 that records prepared SQL+params, asserting
  the real schema → real SQLite SQL wiring (hits `"page"` table, parameterised
  where, real columns on insert) — not "was drizzle called". Full suite 225 green
  (was 223). Deploy gate `npx opennextjs-cloudflare build` succeeded.
- **Files:** `CMS/src/lib/ports/db.ts` (new), `CMS/src/db/index.ts` (now re-export),
  `CMS/scripts/db-port.test.mjs` (new)

## 2026-06-18 18:52 — Unified adapter factory (env → {db,storage,ai})
- **Status:** DONE
- **What I did:** Created `CMS/src/lib/ports/index.ts` — `getPorts()`, the single
  place that reads the Cloudflare context ONCE and hands back all three ports as
  `{ db, storage, ai }`. Thin: it composes the existing `cfDb`/`CfStorage`/`CfAi`
  adapter classes over one resolved `env` (no second env read, no re-implementing
  the per-binding factories). Split into a binding-shaped `cfPorts(env)` seam
  (testable) + the `getPorts()` context wrapper. Preserved EVERY contract: `db` =
  exact `cfDb(env.DB)` drizzle; `storage` = `CfStorage(env.MEDIA)`, throws if MEDIA
  unbound (matches `getStorage()`); `ai` = `CfAi(env.AI)` OR `null` when AI is
  absent (getAi nullability preserved). The individual `getDb/getStorage/getAi`
  are untouched for single-binding callers. Extract/compose only — zero behavior
  change; no caller rewired (no module currently needs all three at once).
- **Verified:** New `scripts/ports-factory.test.mjs` (4 tests) drives the REAL
  imported `cfPorts` against fake bindings: composes the real CfStorage
  (contentType->httpMetadata), real drizzle `db` (a `db.query.page.findFirst()`
  prepares SQL hitting the `page` table on the fake D1), real CfAi (streaming
  inputs reach the binding), `ai === null` when AI unbound, and throws when MEDIA
  unbound. Full suite 231 green (was 227). Deploy gate `npx opennextjs-cloudflare
  build` succeeded.
- **Files:** `CMS/src/lib/ports/index.ts` (new), `CMS/scripts/ports-factory.test.mjs` (new)

## 2026-06-18 18:58 — CMS module against a mocked Db port (the seam's payoff)
- **Status:** DONE
- **What I did:** Proved the ports seam earns its keep with a real-business-logic
  unit test of `upsertPage` (`CMS/src/db/page-store.ts`). Added a tiny
  zero-behavior-change injection seam: `upsertPage(page, injectedDb?: Db)` —
  prod path unchanged (`injectedDb ?? await getDb()`), tests pass a fake. New
  `scripts/page-store.test.mjs` (5 tests) builds a `Db` via the REAL `cfDb`
  adapter over an in-memory `node:sqlite` fake D1 (a thin `prepare/bind/run/all/
  raw` shim) with the REAL migration `page` DDL — so queries compile to real SQL,
  hit a real table, rows really persist. Honest assertions on RETURNED data +
  persisted rows: (1) create persists the row with JSON-serialized blocks/meta,
  (2) update-in-place on (parent,slug) — no duplicate, same id, status changed,
  (3) parentSlug→parentPageId resolution for a child, (4) missing-parent
  rejection (`errors:['parent page "ghost" not found']`, nothing written),
  (5) same slug coexists under two different parents (the unique key is
  (parent,slug)). No tautological "was-called" / `toHaveBeenCalledWith`.
- **To make page-store node-loadable** I switched its runtime VALUE imports off
  the `@/` alias to relative `.ts` (`../lib/ports/db.ts`, `../lib/render/tree.ts`)
  — the project convention for any module a node --test imports (see other test
  headers: "no @/ alias"). Type-only `@/` imports stay (erased by strip-only).
  Same `getDb`/`schema` source `db/index.ts` re-exports — zero behavior change.
- **Verified:** `node --test scripts/page-store.test.mjs` 5/5 green. Full suite
  236 green (was 231). Deploy gate `npx opennextjs-cloudflare build` succeeded.
- **Files:** `CMS/src/db/page-store.ts` (+`injectedDb` param, relative value
  imports), `CMS/scripts/page-store.test.mjs` (new)

## 2026-06-18 19:03 — Mocked-Db unit test of settings-store (content-locales)
- **Status:** DONE
- **What I did:** Added a second mocked-port store test, `scripts/settings-store.test.mjs` (5),
  driving the REAL `getContentLocales`/`setContentLocales` via a new `injectedDb?: Db` seam against
  the REAL `cfDb` over an in-memory `node:sqlite` fake D1 (real `site_settings` table). Honest
  assertions on persisted rows + returned config: safe-default-when-unset (no write on read),
  normalize→persist→read round-trip, key-keyed upsert (update-in-place, no dup row), AND the two
  defensive read branches page-store lacks — present-but-garbage JSON and valid-JSON-wrong-shape both
  fall back to `defaultContentLocales()` without throwing. Expected shapes come from the REAL
  `normalizeContentLocales`/`defaultContentLocales` (not hardcoded), so a regression in store OR
  normalizer is caught. Threaded `injectedDb` through `upsertSetting` + the content-locale accessors;
  switched settings-store's runtime VALUE `@/` imports to relative `.ts` (db port + localize/theme/
  site-settings) so node --test can load it — zero behavior change (prod path = `injectedDb ?? await getDb()`).
- **Verified:** `npm test` 241 green (was 236, +5); `npx opennextjs-cloudflare build` green (deploy gate).
  Confirmed no env.DB/MEDIA/AI read exists OUTSIDE the port factories — the sole-reader invariant still
  holds (admin/layout + auth/guard read CONFIG vars PM_ORIGIN/CMS_AUTH_SECRET/SITE_ID, not the bindings,
  so out of this goal's scope).
- **Files:** CMS/scripts/settings-store.test.mjs (new), CMS/src/db/settings-store.ts (injectedDb seam + relative imports)

## 2026-06-18 19:06 — GREP-GUARD freezing the sole-reader invariant
- **Status:** DONE
- **What I did:** Added `CMS/scripts/ports-sole-reader.guard.test.mjs` — a structural
  guard that scans `CMS/src` and FAILS if any real `env.DB`/`env.MEDIA`/`env.AI`
  BINDING read appears OUTSIDE the allowlisted port dir (`CMS/src/lib/ports/`). Protects
  the whole seam the prior 6 workers built: future code that bypasses the ports breaks CI.
  Three tests: (1) the guard (no violations outside ports), (2) a non-vacuous check (the
  ports dir DOES contain >=1 real read, so green means "none outside", not "matcher
  broken"), (3) a direct unit of the comment-stripper + matcher. Key design: a lexer-lite
  `stripComments` removes `//` and block comments (the chat route's JSDoc mentions `env.AI`
  all over — those must NOT trip the guard), and the matcher is `\benv\.(DB|MEDIA|AI)\b`
  with a trailing word boundary so config vars `env.AI_GATEWAY`/`PM_ORIGIN`/`SITE_ID` are
  deliberately excluded (per CAVEATS: bindings ≠ config vars). Test-only, no app code touched.
- **Verified:** PASSES NOW (invariant holds per #6). PROVED it fails on a stray read:
  injected `const __stray = env.DB;` into `src/db/asset-store.ts` → guard went red naming
  `db/asset-store.ts:59` exactly; reverted → green (`src/` clean via git status). Full suite
  244 green (was 241, +3). Deploy gate `npx opennextjs-cloudflare build` succeeded (dev off first).
- **Files:** CMS/scripts/ports-sole-reader.guard.test.mjs (new)

## 2026-06-18 19:12 — Mocked-Db-port unit test for component-store.ts
- **Status:** DONE
- **What I did:** Added the `injectedDb?: Db` seam (`injectedDb ?? await getDb()`) to
  `upsertComponent`, `upsertImportedComponent`, and `missingComponentNames` in
  `CMS/src/db/component-store.ts`, and switched its `getDb/schema` value import from
  `./index` → `../lib/ports/db.ts` (node-loadable; index just re-exports the port, so
  zero behavior change). New `CMS/scripts/component-store.test.mjs` (8 tests) drives the
  real store via `cfDb()` over a node:sqlite fake D1 (real `component` DDL incl. the
  UNIQUE name index). Covers: upsertComponent insert (props_schema stays NULL on the AI
  path) vs update-in-place (no dup, same id); upsertImportedComponent insert/update DOES
  persist props_schema + JSON-serializes tree; AI-authored→re-imported name keys on the
  UNIQUE name (one row, props_schema filled in); missingComponentNames subset/all-present/
  empty-input. Honest assertions on returned `{action,name}` + rows read straight from
  sqlite — no "was-called".
- **Verified:** `node --test scripts/component-store.test.mjs` 8/8 green; full `npm test`
  252 green (was 244); `npx opennextjs-cloudflare build` green (deploy gate). Ports
  free 3601/3602 before build.
- **Files:** CMS/scripts/component-store.test.mjs (new), CMS/src/db/component-store.ts (seam + import).

## 2026-06-18 19:16 — Mocked-Storage-port unit test for the asset-store module (D1→R2 coverage)
- **Status:** DONE
- **What I did:** Broadened proven mocked-port coverage from D1 to **R2**. asset-store is the
  one CMS module spanning BOTH ports (R2 bytes + D1 metadata row). Added an injected-Storage seam
  mirroring `injectedDb?`: `putAsset(input, injectedStorage?, injectedDb?)`,
  `deleteAsset(key, injectedStorage?, injectedDb?)`, `getAssetObject(key, injectedStorage?)`,
  `listAssets(injectedDb?)` — all params OPTIONAL so prod path (`injected ?? await getX()`) is
  unchanged. Switched the module's value imports `./index`→`../lib/ports/db.ts` and
  `@/lib/ports/storage`→`../lib/ports/storage.ts` (node --test can't resolve the `@/` alias /
  `./index` barrel re-export; index just re-exports, zero behavior change). New test
  `scripts/asset-store.test.mjs` (6) drives the REAL store fns against an in-memory fake Storage
  (Map: put/get/delete) + `cfDb` over a `node:sqlite` fake D1 (real asset DDL, real SQL).
- **Verified:** HONEST assertions — derived `size = bytes.byteLength` (not from input),
  contentType carried to storage, a real id, R2↔D1 round-trip on put, getAssetObject returns the
  exact stored bytes / null when absent, deleteAsset removes from BOTH R2 and the D1 row, delete is
  key-scoped (keeps the other). No `was-called` tautologies. All 6 callers verified to use the
  no-injection signature (optional params → zero behavior change). `npm test` 258 green (was 252);
  `npx opennextjs-cloudflare build` green (deploy gate; no dev on 3601/3602 first).
- **Files:** CMS/scripts/asset-store.test.mjs (new), CMS/src/db/asset-store.ts (seam + relative imports).

## 2026-06-18 19:33 — Mocked-Ai-port test for the chat STREAMING consume/forward path (trifecta complete)
- **Status:** DONE
- **What I did:** Closed the last unproven seam — the **Ai port consumed by a business
  module under streaming**. Db & Storage were already proven against mocked ports; the
  only Ai coverage was `ai-port.test.mjs` (the adapter's pass-through), never the CONSUMER.
  Extracted the inline `reframe()` out of `src/app/api/chat/route.ts` into a new
  node-loadable `src/lib/chat/reframe.ts` as `reframe(upstream, runTools)` — the CF-coupled
  tool dispatch (`runTools`, which does D1/R2 writes) is now INJECTED, so the module is pure
  (imports only `./sse.ts`). The route imports `reframe` from the new module and passes its
  existing `runTools` — delegation, same frames/order. New `scripts/reframe.test.mjs` (6 tests)
  drives the REAL reframe over a FAKE Ai port: a `ReadableStream<Uint8Array>` that emits
  multi-chunk streamed OpenAI-style SSE, deliberately splitting one `data:` line MID-JSON across
  two chunks (proves cross-chunk token assembly, not a single blob) and streaming a tool call's
  args as 4 separate fragments (proves `ToolCallAccumulator` reassembly → ONE call with PARSED
  args). Honest assertions on the re-framed client protocol output (event names + parsed JSON):
  assembled "streamed-token", a single create_page call with `{slug,title}`, interleaved
  token-then-tool ordering, mid-stream upstream error → `error` event (not `done`), keep-alive
  line tolerance. No `was-called` tautologies — the captured `tools.finish()` IS the real parse.
- **Verified:** `node --test scripts/reframe.test.mjs` 6/6 green; full `npm test` 264 green (was
  258, +6); `npx opennextjs-cloudflare build` green (deploy gate; ports 3601/3602 free first).
  Found+fixed a latent hang surfaced only by node's stream impl: a `pull()` whose chunk parsed to
  only a partial line emitted zero frames and didn't close, leaving the consumer's `read()` pending
  forever. Fixed by looping reads inside `pull()` until a frame is emitted or the stream closes —
  identical output frames & order (the original relied on the runtime re-pulling on no-enqueue,
  which Workers' ReadableStream does but node's left pending). Robustness fix, not a behavior change.
- **Files:** CMS/src/lib/chat/reframe.ts (new), CMS/scripts/reframe.test.mjs (new),
  CMS/src/app/api/chat/route.ts (delegates to extracted reframe; inline copy removed).

## 2026-06-18 — P0 BUG: CMS container deploy build failed (`Cannot find name 'R2ObjectBody'`)
- **Task:** fix the human-reported P0 — CMS deploys fail in the container with a tsc error from the
  Storage port. Priority rule 0 (bugs first).
- **Root cause (deeper than reported):** the Workers global types (`R2ObjectBody`, `R2Bucket`,
  `D1Database`, `Ai`) AND the typed `CloudflareEnv` env interface both live ONLY in
  `CMS/cloudflare-env.d.ts`, which is **.gitignored** (generated by `wrangler types`). Local builds
  had a warm copy; a fresh container clone (`git clone --depth 1` + `npm ci`) has neither, so tsc
  fails — first on `R2ObjectBody`, then (once that's fixed) on `Property 'DB' does not exist on type
  'CloudflareEnv'`. The reported "`@cloudflare/workers-types` missing" was half the story.
- **Fix (two-pronged, both needed):**
  1. Added `@cloudflare/workers-types@^4.20260617.1` (matches workerd@1.20260616.1 in the generated
     types) to `CMS/package.json` devDependencies + refreshed package-lock. Pinned
     `compilerOptions.types: [node, react, react-dom, @cloudflare/workers-types]` in CMS/tsconfig.json
     → global Workers types resolve from node_modules in any clean install, no typegen needed, and the
     explicit allowlist means it can't silently break again.
  2. Added a `npm run cf-typegen` step to the deployer container build script
     (deployer/src/index.ts) right after `npm ci`, before `opennextjs-cloudflare build` — regenerates
     `cloudflare-env.d.ts` (the `CloudflareEnv` env shape) deterministically from CMS/wrangler.jsonc.
     Hard-fails the deploy (`report failed` + `exit 1`) if typegen errors, so it can't silently
     produce a broken build.
- **Verification (the EXACT container path, not a warm build):** dev off (3601/3602 free);
  `rm -f CMS/cloudflare-env.d.ts && rm -rf node_modules && npm ci` then container step order
  `npm run cf-typegen` → `npx opennextjs-cloudflare build` = **GREEN**. (Reproduced the original
  failure first by deleting the gitignored file: confirmed both `R2ObjectBody` and `CloudflareEnv.DB`
  errors before the fix.) CMS `npm test` = **264 green** (port tests still import fine). Deployer
  Worker compiles (`wrangler deploy --dry-run` built bundle + container image).
- **Files:** CMS/package.json (+ workers-types dep), CMS/package-lock.json, CMS/tsconfig.json
  (+ `types`), deployer/src/index.ts (+ cf-typegen build step).

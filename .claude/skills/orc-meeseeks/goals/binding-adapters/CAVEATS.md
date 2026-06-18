# Caveats — binding-adapters
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **Do NOT build a Vercel/Postgres/Blob adapter.** main is "fully Cloudflare-native". Only the
  interfaces + the CF adapter are in scope. A second, unused, untested adapter is debt — skip it.
- **Zero behavior change.** This is a refactor. The deployed CMS Worker must behave identically.
  Don't "improve" the data/storage/AI logic while extracting it — extract only.
- **The deploy gate is `npx opennextjs-cloudflare build`** (runs `next build` internally). NEVER run
  it while `npm run dev` is on 3601/3602 — it corrupts `.next` and 500s the server. Stop dev first.
- **Drizzle is already a layer.** The `Db` port likely wraps the drizzle instance (or its factory),
  not raw `env.DB`. Don't reinvent an ORM — `CMS/src/db/index.ts` is the seam.
- **R2 access is native (`env.MEDIA.put/get/delete`, no presigning)** per `asset-store.ts`. Keep the
  `Storage` port minimal — only the methods actually called.
- **Workers AI is OpenAI-compatible + streaming** (`env.AI.run(model, {messages, stream})`). The `Ai`
  port must preserve streaming; don't collapse it to a non-streaming call.
- **Testing discipline is enforced** (orc-test-review). No tautological mocks, no
  `toHaveBeenCalledWith` on internal collaborators. The mock-the-port test must assert real behavior.
- **Ports live in `CMS/src/lib/ports/<name>.ts`** (Storage is there). Put `Db`/`Ai` alongside it.
- **node --test CAN import the real adapter `.ts`** even though `getStorage()` imports
  `@opennextjs/cloudflare` — the import resolves but isn't invoked unless you call the factory, so
  the test imports `CfStorage` directly (no drift-prone re-declaration). DO import the real class.
- **node strip-only mode rejects TS parameter properties** (`constructor(private readonly x)`).
  Use an explicit field + assignment in the constructor, or the test import throws "not supported
  in strip-only mode". (That's why `CfStorage` declares the field separately.)
- **Pattern for the next ports:** interface = only the methods actually called; adapter wraps the
  binding 1:1; a `getX()` factory is the SOLE `env.X` reader. asset-store dropped its `getBucket()`
  + `getCloudflareContext` import entirely — do the same for the Db/Ai seams.
- **Relative imports inside a port that node --test must load need the `.ts` extension.**
  `db.ts` imports `../../db/schema.ts` (not extensionless) — node strip-only mode resolves real
  paths, not tsconfig `bundler` resolution. The build is fine with it (`allowImportingTsExtensions`
  is on, and `src/lib/**` already imports `.ts` everywhere). Storage didn't hit this — it imports
  no relative sibling.
- **`ChatMessage` is declared in three places** (`lib/chat/sse.ts`, `app/api/chat/route.ts` local,
  and now `lib/ports/ai.ts`), all structurally `{role:string,content:string}` so TS is happy and
  the build passes. Don't try to unify them as part of the extract — that's a separate cleanup; the
  port just declares its own minimal shape, consistent with how Db/Storage stayed self-contained.
- **The `Ai` port is a behavioral method (`chat`), not a type-alias** (unlike `Db` which IS the
  drizzle client). The binding's `run` overloads are messy (forced `Parameters<Ai["run"]>` casts in
  the old route), so the adapter takes a narrow `AiBinding = { run(model, inputs, options?) }` and
  the port exposes one clean `chat()` — that's what let the route drop all the casts.
- **drizzle-d1 selects call `stmt.bind(...).raw()`, not `.all()`.** A fake `D1Database` used in a
  port test must expose `raw()` on the prepared statement (returns rows-as-arrays) or the select
  throws `this.stmt.bind(...).raw is not a function`. Inserts use `.run()`. See `db-port.test.mjs`.
- **`npx opennextjs-cloudflare build` resets the shell working directory** (subsequent Bash calls
  land back at repo root, not `CMS/`). After a build, use absolute paths or re-`cd` for memory-file
  writes — a relative-path heredoc append silently failed ("no such file or directory").
- **The unified factory `getPorts()` lives in `lib/ports/index.ts`** and COMPOSES the three existing
  adapters over ONE `getCloudflareContext` read. Don't re-implement per-binding logic there. The
  `cfPorts(env)` half is the test seam; `getPorts()` is the thin context wrapper. `ai` is `Ai|null`.
- **To unit-test a `*-store.ts` module, two things are needed:** (1) inject the Db — add a tiny
  `injectedDb?: Db` param, `injectedDb ?? await getDb()` (prod path unchanged, zero behavior change);
  (2) make the module node-loadable — switch its runtime VALUE `@/...` imports to relative `.ts`
  (`../lib/ports/db.ts`, `../lib/render/tree.ts`). The PROJECT CONVENTION is that any module a
  `node --test` loads avoids the `@/` alias (node doesn't resolve tsconfig paths). Type-only `@/`
  imports are fine (strip-only erases them). Don't rewrite the whole file — just the value imports.
- **A REAL fake D1 is easy with `node:sqlite` (built in, no dep).** `DatabaseSync(":memory:")`, run the
  migration DDL, then shim drizzle-orm/d1's surface: `prepare(sql)` → `{ bind(...p) }` → `{ run, all,
  raw }`. drizzle SELECT calls `.bind(...).raw()` (rows-as-ARRAYS in column order — use
  `stmt.columns().map(c=>c.name)` to order); writes call `.run()`; `all()` returns `{results:[objs]}`.
  This gives real SQL → real storage → real rows, so store tests assert REAL returned/persisted data,
  not "was-called". See `scripts/page-store.test.mjs`. Far cleaner than parsing drizzle predicate objects.
- **CORE SCOPE IS COMPLETE.** All 3 ports (Db/Storage/Ai) + unified `getPorts()` factory + a
  mocked-port store unit test all DONE & build-green. There is no second adapter (CF-only — see top
  caveat). Further runs must INVENT the next valuable seam slice (rule 3), not redo these.
- **`getCloudflareContext().env` reads OUTSIDE lib/ports are NOT all violations.** `admin/layout.tsx`
  and `lib/auth/guard.ts` read `env.PM_ORIGIN`/`CMS_AUTH_SECRET`/`SITE_ID` — those are CONFIG VARS, not
  the `DB`/`MEDIA`/`AI` BINDINGS this goal scopes. The sole-reader invariant is "the factory is the only
  reader of env.DB|MEDIA|AI", and that holds. Don't build a Config/Env port for these — scope creep on a
  CF-only goal. grep for `env\.DB|env\.MEDIA|env\.AI` specifically, not all `getCloudflareContext`.
- **The sole-reader invariant is now FROZEN BY CI** — `scripts/ports-sole-reader.guard.test.mjs` scans
  `CMS/src` and fails if any real `env.DB|MEDIA|AI` BINDING read appears outside `CMS/src/lib/ports/`.
  If you ADD a new port that reads a binding, it lives under `lib/ports/` (already allowlisted — the
  whole dir is). If you legitimately move a binding read elsewhere, update the guard's `ALLOWLIST_DIR`.
  The guard strips `//`+block comments first (chat-route JSDoc says `env.AI` ~6×; those are NOT reads)
  and the matcher has a trailing `\b` so `env.AI_GATEWAY` (config) is excluded — don't widen the regex
  to bare `env.AI` or you'll re-catch the gateway config var. The guard is text-based (lexer-lite), not
  AST: it can't see `const x = "env"; (globalThis as any)[x].DB` — fine, nobody writes that; YAGNI.
- **Stores that import the `./index` barrel also need the relative-`.ts` switch for node --test.**
  `component-store.ts` imported `{getDb,schema}` from `./index` (which re-exports from
  `@/lib/ports/db`). node strip-only can't resolve the barrel's `@/` re-export, so switch the
  store's value import to `../lib/ports/db.ts` directly (page-store already does). It's a
  re-export, so prod behavior is identical — zero behavior change.
- **A module that spans TWO ports (asset-store: Storage+Db) takes BOTH injected params.** Order them
  by the call order in the fn (`putAsset(input, injectedStorage?, injectedDb?)`), keep them OPTIONAL
  (`injected ?? await getX()`) so all existing call sites are untouched (zero behavior change — verify
  with a grep of every caller). The Storage fake is trivial: an in-memory `Map` matching put/get/delete
  (no node:sqlite needed for the R2 side). See `scripts/asset-store.test.mjs`.
- **TRIFECTA COMPLETE.** All 3 ports are now proven against mocked ports IN A BUSINESS MODULE:
  Db (page/settings/component stores), Storage (asset-store), and **Ai** (the chat `reframe`
  streaming consumer — `scripts/reframe.test.mjs`). Don't redo this; INVENT the next slice (rule 3).
- **To unit-test the Ai-port STREAMING consumer, extract the stream stage, don't test the route.**
  `route.ts` is `@/`-aliased + pulls CF-coupled tool/store imports → not node-loadable. The pure
  consume/forward logic now lives in `lib/chat/reframe.ts` as `reframe(upstream, runTools)` with the
  CF tool dispatch INJECTED (mirrors `injectedDb?`/`injectedStorage?`). Fake the Ai port as a
  `ReadableStream<Uint8Array>` that enqueues SSE byte pieces one pull at a time — that's the exact
  `Ai.chat()` return shape. SPLIT a `data:` line mid-JSON across two pieces to actually exercise the
  cross-chunk buffering (a single-blob fake proves nothing about streaming).
- **A reframe `pull()` that parses only a PARTIAL line must NOT return without re-reading.** node's
  ReadableStream does NOT reliably re-call `pull()` after a no-enqueue resolve → the consumer's
  `read()` hangs forever (Workers' impl happened to re-pull, hiding it in prod). `reframe` now LOOPs
  `reader.read()` inside `pull()` until it emits ≥1 frame or closes. If you touch reframe, keep that
  loop or the streaming tests (and possibly prod under load) will hang.

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

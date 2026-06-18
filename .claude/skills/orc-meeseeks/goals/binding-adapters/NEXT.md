# Note to the next Meeseeks (binding-adapters)
DONE so far: `Storage` port (`CMS/src/lib/ports/storage.ts`) and `Db` port
(`CMS/src/lib/ports/db.ts` — `cfDb` + `getDb()`, sole `env.DB` reader; `src/db/index.ts`
is now just a re-export so `@/db` callers are unchanged). Copy these exactly.

Take the next TODO: the **`Ai` port** over `env.AI.run`.
- Read `CMS/src/app/api/chat/route.ts` + `CMS/src/lib/chat/*` first to find every `env.AI` read.
- Port = ONLY the methods actually called. **Preserve streaming** (`env.AI.run(model, {messages,
  stream:true})` returns a stream) AND the OpenAI-compatible message shape — do NOT collapse to a
  non-streaming call. That's the headline caveat for this one.
- `cfAi(ai)` adapter wraps the binding 1:1; a `getAi()` factory is the SOLE `env.AI` reader.
- Test imports the REAL adapter (`.ts`), drives it against a fake `AI` binding, asserts the real
  call shape (model + {messages, stream}) AND that a streamed response is passed through, not buffered.
- GOTCHAS (CAVEATS.md): use `.ts` extension on any relative import the node --test must load; no TS
  parameter properties (explicit field + assignment); no tautological mocks.
- Gate: `npm test` (225+ green) + `npx opennextjs-cloudflare build` (NEVER while `npm run dev` runs).
After Ai: the unified `env → {db,storage,ai}` factory, then a CMS-module-against-mocked-port test.

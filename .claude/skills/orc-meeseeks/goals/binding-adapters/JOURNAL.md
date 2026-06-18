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

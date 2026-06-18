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

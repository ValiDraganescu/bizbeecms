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

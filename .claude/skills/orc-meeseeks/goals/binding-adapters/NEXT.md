# Note to the next Meeseeks (binding-adapters)
The `Storage` port is DONE — `CMS/src/lib/ports/storage.ts` (interface + `CfStorage` + `getStorage()`,
the sole `env.MEDIA` reader), with `scripts/storage-port.test.mjs`. Copy that exact pattern.

Take the next TODO: **the `Db` port** over `CMS/src/db/index.ts` (the drizzle factory).
- Read `CMS/src/db/index.ts` first — the seam is `getDb()` (the drizzle instance), NOT raw `env.DB`.
  Drizzle is already the layer; the `Db` port likely just re-homes `getDb()` so the `env.DB` read lives
  in the port module and callers depend on the port. Don't reinvent an ORM. Extract only.
- Make the new factory the ONLY reader of `env.DB`.
- Honor the strip-only-mode caveat (no TS parameter properties — explicit field + assignment).
- Write a node --test that imports the REAL adapter and asserts real behavior (no tautological mocks).
- Gate: `npm test` (223+ green) + `npx opennextjs-cloudflare build` (NEVER while `npm run dev` runs).
After Db: the `Ai` port (preserve streaming), then the unified `env → {db,storage,ai}` factory.

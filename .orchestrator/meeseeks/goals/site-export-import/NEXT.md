# Note to the next Meeseeks (site-export-import)

FORMAT.md is written (`goals/site-export-import/FORMAT.md`) — read it FIRST, it is
now the contract every task below builds against. Do not re-derive the table
inventory or re-decide the asset strategy; both are settled there.

Next TODO (per BACKLOG.md, now that FORMAT.md exists): **Export core (tracer, no
assets yet)**. Build `GET /api/site-export` (operator-only, `requireAdmin` guard
— see `src/lib/auth/guard.ts` for the pattern other admin routes use) that emits
the `bizbeecms.site` v1 envelope from FORMAT.md §3, using:
- `getDb()`/Drizzle reads for `page`, `pageVersion` (full history per §2),
  `component`, `collection`, `siteSettings`, `promptVersion`, `dataSource` (drop
  `secretEnc`, add `hasSecret`), `dataSourceRequest`, `asset` (metadata only).
- `contentSelect("SELECT * FROM " + tableName)` per collection row (already
  fenced/read-only — see `lib/content/content-db.ts`) for `collectionData`.
- Stub `tables.asset` with metadata but NO bytes (that's the NEXT task after
  this one, per FORMAT.md §4 / BACKLOG's "Export assets" task).

Keep the serialization logic PURE where possible (a function that takes already-
fetched rows and returns the envelope object) so it's node-testable per the
repo's "test business logic only" discipline — the route itself just does the
I/O + calls that function. Unit-test the pure serializer; commit.

Do NOT start on Import yet — Export core lands first per BACKLOG.md's own order.

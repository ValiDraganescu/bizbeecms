# Note to the next Meeseeks (site-export-import)

**Export core is DONE and live-verified.** `GET /api/site-export` (operator-only,
`requireAdmin`-gated) works today on `:3602` and returns a real `bizbeecms.site`
v1 envelope — confirmed against the actual local tableonline site data (13
pages, 136 page versions, 41 components, 7 collections/73 rows, 61 assets,
6 data sources with zero `secretEnc` leakage). Read FORMAT.md first — it's still
the contract, unchanged by this run.

- Pure serializer: `CMS/src/lib/site-export/site-export.ts` (`buildSiteExport`)
  — 8 unit tests in the sibling `.test.ts`, all green.
- Thin route: `CMS/src/app/api/site-export/route.ts`.
- `tsc --noEmit` clean, full `npm test` 1476/1476 green.

**Next TODO (per BACKLOG.md, in order): "Export assets"** — extend the export
so R2 binaries travel with the artifact, per FORMAT.md §4's settled protocol
(manifest + per-asset fetch, NOT a zip):

1. Add `GET /api/site-export/asset/<key>` — `requireAdmin`-gated, streams ONE
   asset's raw bytes via the `Storage` port (`lib/ports/storage.ts`'s `get`),
   with `Content-Type` from the matching `asset.contentType` row (look it up by
   `key`, 404 if the asset/key doesn't exist). No changes needed to
   `GET /api/site-export` itself — `tables.asset` already lists every key
   (Export core's scope was explicitly metadata-only, bytes are THIS task).
2. "Verify a real image round-trips byte-identical locally" (BACKLOG's own
   acceptance bar): fetch one asset's bytes from the new route, compare against
   what `Storage.get` returns directly (or a checksum) — a small script or a
   `.test.ts` with a fake `Storage` port is enough; no live R2 needed if the
   port is injectable (check how other routes/tests fake `Storage`, e.g.
   `asset-store.ts`'s tests if any exist, before inventing a new fake shape).
3. Client-side packaging (how the export UI assembles `site.json` + N asset
   downloads into one operator-facing "download") is explicitly OUT OF SCOPE
   per FORMAT.md §4 — that's the later "Admin UI" task, not this one.

Do NOT start on Import yet — Export assets is next per BACKLOG.md's own order,
then Import validate, then Import execute, then Admin UI, then E2E.

One thing worth knowing before you touch `CAVEATS.md` again: that file's body
was copy-pasted from a DIFFERENT goal (`tableonline-home`) by an earlier run —
header is now fixed, but most of its content is irrelevant MCP-authoring noise
for this goal. Don't be confused by it; my new entries are appended at the top,
right after the corrected header.

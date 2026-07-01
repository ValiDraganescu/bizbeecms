# Note to the next Meeseeks (external-data-sources)

Slice 1 is DONE (2026-07-02): `data_source` + `data_source_request` tables
(migration 0025), write-only encrypted secret (REUSED lib/crypto/secret-box —
don't write new crypto), pure validation (lib/data-sources/validate.ts, 14 node
tests), Admin-gated CRUD under /api/data-sources/** incl. saved requests with
per-request method/path/query/bodyTemplate/cacheEnabled/cacheTtlSec/retryable.

FIRST THING: run the deferred build gate — `npx opennextjs-cloudflare build` in
CMS/ (a dev server was live on :3602 during my run; check `lsof -nP -i :3602`
first, NEVER build while dev runs). tsc + full node suite (1251) were green.

PICK NEXT: **Slice 2 — central fetch engine (`lib/data-sources/fetch.ts`).**
Everything is staged for it:
- `decryptSourceSecret(id, kek)` in db/data-source-store.ts gives you the secret
  (server-side only).
- `extractPlaceholders` / placeholder regex live in validate.ts — substitution
  must URL-encode (path/query) and JSON-escape (body); never raw-splice.
- Retry policy: ≤2 retries on network error/5xx/429, small backoff, never other
  4xx, only GET or `request.retryable === true`.
- Cache: only GET-or-cacheable, per-request cacheEnabled+cacheTtlSec (already on
  the row), key = source + method + resolved URL + body hash. Design the
  key/namespace so Slice-7 purge (per-request + global) is cheap — a version
  counter beats enumerating keys.
Keep the engine pure-ish (inject fetch + now + cache) so node tests cover retry
counts, no-retry-on-POST, placeholder encoding, cache-key stability — the
backlog's REVISED Slice-2 note has the full test list.

KEY DECISIONS (don't relitigate): server-side fetch only, secret never to the
browser; binding stays source-agnostic (kind: collection|api) on the
content-collections seam; OAuth2 deferred.

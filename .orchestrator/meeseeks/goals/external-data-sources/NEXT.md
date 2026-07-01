# Note to the next Meeseeks (external-data-sources)

Slice 4 is DONE (2026-07-02): CMS → Data Sources admin UI is live at
/admin/data-sources (nav entry in admin-sections.ts). Sources CRUD (write-only
secret, in-app confirms) + per-source saved-requests CRUD (method/path/query/
body templates, per-request cache on/off + TTL, retryable flag) + inline Test
panel: one input per `{placeholder}` (pure `requestPlaceholders()` in
validate.ts) → POST /api/data-sources/:id/requests/:requestId/test (admin-
gated, cache bypassed, secret stays server-side). Verified LIVE against
Open-Meteo via the dev server. 1298/1298 node tests, tsc green.

STILL OWED: the opennext build gate — deferred FOUR times (dev server pid
79854 on :3602 every run; `lsof -nP -i :3602`, NEVER build while dev runs).
If :3602 is free, run `npx opennextjs-cloudflare build` in CMS/ FIRST.

PICK NEXT: **Slice 5 — bind UI picks Collection OR API source.** In the
page-builder bind panel (src/components/page-builder/binding-panels.tsx —
content-collections Phase-2 UI), the source picker must list Collections AND
API sources; picking an API source → choose one of its saved requests, map
response fields → declared props (map values are DOT-PATHS — see caveat), and
wire PARAM PASSING: for each `{placeholder}` in the chosen request
(reuse `requestPlaceholders()`), pick a block prop or literal; store as
`params` on the source ref ({placeholder} → literal | "{prop}") — Slice-3
hydration already resolves it. Use the Slice-4 Test endpoint to fetch a sample
response inside the bind panel as a mapping guide (dot-path suggestions from
the sample's keys would be a nice touch). EN/FI/ET. Gate.

After Slice 5: Slice 6 (AI tools) and Slice 7 (cache purging — use the fetch
engine's cacheVersion, see caveat; per-request purge + global purge action).

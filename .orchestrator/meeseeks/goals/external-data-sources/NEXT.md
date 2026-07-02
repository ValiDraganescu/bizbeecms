# Note to the next Meeseeks (external-data-sources)

2026-07-02: The dispatch name-shadow BUG is FIXED (makeDispatcher sets the tool
name LAST; create_data_source nests `source:`, create_collection uses
`collectionName`; regression test in tool-dispatch.test.mjs). Bugs section is
now empty. Suite 1337/1337 + tsc green.

STILL OWED: the opennext build gate — deferred TWELVE times (dev server pid
79854 on :3602 every run, active browser connections; `lsof -nP -i :3602`,
NEVER build while dev runs, never kill it). If :3602 is ever free, run
`npx opennextjs-cloudflare build` in CMS/ FIRST — that alone is a worthy run.

All 8 slices + purge + OAuth2 + live AI e2e are DONE. Backlog has no open
TODOs — next value candidates (pick one, add to BACKLOG):
- OAuth2 client_secret_post fallback ONLY if a real provider demands it (YAGNI).
- A docs/help pass in the Data Sources UI (mapping dot-paths, placeholder
  syntax) — check what's already covered before writing.
- Renderer-side smoke: a page bound to a real public API rendered via the
  public route (Slice-3/5 were verified, but a fresh end-to-end render check
  after all the later slices is cheap insurance).

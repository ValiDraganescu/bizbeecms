# Note to the next Meeseeks (external-data-sources)

2026-07-02: Renderer-side e2e render smoke is DONE — an api-bound List on a
PUBLISHED page SSRs real API data via the public route (3 jsonplaceholder rows
in real `<h2>` markup), and source-delete degrades gracefully (200, 0 rows,
no 500). Everything cleaned up. No code changed this run.

STILL OWED: the opennext build gate — deferred THIRTEEN times (dev server pid
79854 on :3602 every run, active browser connections; `lsof -nP -i :3602`,
NEVER build while dev runs, never kill it). If :3602 is ever free, run
`npx opennextjs-cloudflare build` in CMS/ FIRST — that alone is a worthy run.

All 8 slices + purge + OAuth2 + AI e2e + renderer e2e are DONE. Backlog has no
open TODOs — remaining value candidates (pick one, add to BACKLOG):
- Data Sources UI help/docs pass (mapping dot-paths, `{placeholder}` syntax,
  itemsPath) — CHECK what the UI already explains before writing; caveats say
  show placeholder syntax via input `placeholder=` attrs (ICU-brace gotcha).
- OAuth2 `client_secret_post` fallback ONLY if a real provider demands it
  (YAGNI until then).

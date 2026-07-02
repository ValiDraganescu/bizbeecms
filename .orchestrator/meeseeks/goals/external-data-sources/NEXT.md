# Note to the next Meeseeks (external-data-sources)

2026-07-02: Data Sources UI help/docs pass is DONE — audited ALL existing copy
first; only two gaps existed and both are filled (`dataSources.pathHelp`,
`dataSources.testHelp`, EN/FI/ET, ICU-safe). Do NOT redo a help pass — the
manager + binding panels are now fully covered (queryHelp/bodyHelp/secretHelp/
pathHelp/testHelp + apiMapHelp/itemsPathHint/pathPlaceholder/sample loader).

STILL OWED: the opennext build gate — deferred FOURTEEN times (dev server pid
79854 on :3602 every run, active browser connections; `lsof -nP -i :3602`,
NEVER build while dev runs, never kill it). If :3602 is ever free, run
`npx opennextjs-cloudflare build` in CMS/ FIRST — that alone is a worthy run.

All 8 slices + purge + OAuth2 + AI e2e + renderer e2e + help pass are DONE.
Backlog has no open TODOs — remaining value candidates (pick one, add to
BACKLOG):
- OAuth2 `client_secret_post` fallback ONLY if a real provider demands it
  (YAGNI until then).
- If truly nothing else: re-read GOAL.md "What good looks like" against the
  live UI and hunt for polish/regression gaps (e.g. a11y pass on the
  data-sources forms, or a node test for requestPlaceholders edge cases if
  uncovered).

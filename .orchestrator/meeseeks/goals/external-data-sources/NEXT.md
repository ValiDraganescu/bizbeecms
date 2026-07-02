# Note to the next Meeseeks (external-data-sources)

2026-07-02: The binding-panels a11y pass is DONE (live regions on
SampleLoader, row-scoped concat aria-labels in QueryBuilder; the file has NO
toggles, so no aria-expanded — see CAVEATS). Manager forms + binding panels
are both a11y-passed now. Query-lines tests, help pass, renderer e2e, AI e2e,
all 8 slices, purge, oauth2 — all DONE. Don't redo any of it.

STILL OWED: the opennext build gate — deferred SEVENTEEN times (dev server
pid 79854 on :3602 every run; `lsof -nP -i :3602`, NEVER build while dev
runs, never kill it). If :3602 is ever free, run
`npx opennextjs-cloudflare build` in CMS/ FIRST — that alone is a worthy run.

Backlog has no open TODOs. Remaining candidates (invent-a-slice territory):
- **Keyboard/live smoke of the builder binding panels** in a real browser
  (VoiceOver/tab-order) — the attr work is done but never exercised by a
  human-like pass; only worth it if you have browser tooling in reach.
- OAuth2 `client_secret_post` fallback ONLY if a real provider demands it
  (YAGNI until then).
- Re-read GOAL.md vs the shipped state and pick the next most valuable
  slice — the feature surface itself is complete per the revised spec.

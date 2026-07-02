# Note to the next Meeseeks (external-data-sources)

2026-07-02: A11y pass on the Data Sources forms is DONE (aria-expanded/controls
toggles, role="status" announcements, required inputs, aria-labeled row buttons,
ConfirmModal autoFocus+aria-label). Do NOT redo it. Help pass, renderer e2e,
AI e2e, all 8 slices, purge, oauth2 — all DONE too.

STILL OWED: the opennext build gate — deferred FIFTEEN times (dev server pid
79854 on :3602 every run; `lsof -nP -i :3602`, NEVER build while dev runs,
never kill it). If :3602 is ever free, run `npx opennextjs-cloudflare build`
in CMS/ FIRST — that alone is a worthy run.

Backlog has no open TODOs. Remaining value candidates (pick one, add to
BACKLOG):
- Node test for `requestPlaceholders` / `parseQueryLines` edge cases if
  actually uncovered (check test files first — don't duplicate).
- OAuth2 `client_secret_post` fallback ONLY if a real provider demands it
  (YAGNI until then).
- Re-read GOAL.md "What good looks like" against the live UI for any residual
  polish/regression gap (the binding panels in the page builder haven't had a
  dedicated a11y look — the manager forms now have).

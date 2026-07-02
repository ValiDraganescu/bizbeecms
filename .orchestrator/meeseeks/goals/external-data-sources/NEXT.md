# Note to the next Meeseeks (external-data-sources)

2026-07-02 10:25: Form slice (d) is DONE — AI tools `create_form` + `bind_form`
(both target kinds; api = resolveSourceAndRequest, collection = exists +
publicSubmissions ON with a self-correcting error naming the PATCH toggle fix;
NO map arg BY DESIGN — results return `fields` + a note since submit maps by
NAME; all registrations; 15 node tests; tsc + 1396 + opennext worktree gate
green; live debug-route scope check on :3602). Details: JOURNAL 2026-07-02 10:20.

## FIRST: check ## Bugs (rule 0) — all DONE when I popped out.

## Heads-up: slice (b) is DOING by a parallel Meeseeks
When I committed, Form slice (b) (page-builder Form panel + Collections
publicSubmissions toggle) was freshly marked DOING by another worker — do NOT
take it or touch the page-builder panel files unless it's clearly abandoned
(check BACKLOG status + `git status`/`git log` for in-flight edits). Slice (d)
left it helpers: page-blocks isForm/addFormToSection/setBlockField({formTarget}),
form-tools mergeFormTarget; and the panel should SHOW the expected field names
(by-name mapping) like the AI tools do — see the three new (d) caveats.

## Good next task: live AI e2e smoke of the Form tools
Mirror the Slice-6 live smoke: a real /api/chat model round-trip chaining
list_data_sources → create_form (fixture source, e.g. the POST /post echo
request) → create_component with matching `<input name=…>` + submit button →
update_page_blocks to place it in the form → live submit on :3602; then clean
up. Proves the model actually drives the new tools (node tests + scope check
covered everything but a real model). Costs one model call.

Otherwise: Form slices then read a-d DONE — re-read GOAL.md "what good looks
like" for remaining gaps (most were confirmed shipped by earlier fresh-eyes
hunts; the goal has twice been recommended for curator ARCHIVE once forms
finish — flag it in your result if (b) is also DONE by then).

Gates: tsc + node suite + opennext (isolated-worktree recipe in CAVEATS; dev on
:3602 is live — never build in-repo while it runs; `npm run cf-typegen` in the
worktree before tsc).

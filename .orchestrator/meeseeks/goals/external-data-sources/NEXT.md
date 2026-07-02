# Note to the next Meeseeks (external-data-sources)

2026-07-02 10:29: The PINNED live AI e2e smoke of the Form tools is DONE — a
real gpt-4o-mini /api/chat run drove create_form for BOTH target kinds, the
publicSubmissions-off self-correcting error fired verbatim AND the model
recovered in-round, all 4 live submit paths passed (native 303 / fetch JSON ×
api / collection), items landed forced-draft with rogue fields dropped. Full
cleanup done; memory-only commit. Details: JOURNAL 2026-07-02 10:29.

## FIRST: check ## Bugs (rule 0) — all DONE when I popped out.

## Heads-up: slice (b) is DOING by a parallel Meeseeks
Form slice (b) (page-builder Form panel + Collections publicSubmissions
toggle) belongs to meeseeks-eds-ui in a parallel terminal — do NOT take it or
touch binding-panels / Collections UI files unless clearly abandoned (check
BACKLOG + git status for in-flight edits).

## Good next task: one of the two smoke-findings TODOs (top of ## Tasks)
1. **Missing-block-id error message** (small, pure): page-blocks validation
   says "id must be a short identifier…" even when the id is ABSENT — live,
   the model retried an identical payload and gave up. Make the absent case
   say "missing — add a short unique id, e.g. …". Failing-first test.
2. **create_form optional `child` arg** (medium): one call → form + child
   component placed (addFormToSection exists); removes the destructive
   get_page/update_page_blocks dance that twice clobbered the smoke page.
Both are pure-ish lib/chat + lib/pages work — they do NOT collide with slice
(b)'s UI files, but re-check what (b) committed before touching page-blocks.ts.

Otherwise: forms a/c/d + AI smoke are DONE; when (b) lands, the goal has twice
been recommended for curator ARCHIVE — flag it in your result.

Gates: tsc + node suite + opennext (isolated-worktree recipe in CAVEATS; dev on
:3602 is live — never build in-repo while it runs; `npm run cf-typegen` in the
worktree before tsc).

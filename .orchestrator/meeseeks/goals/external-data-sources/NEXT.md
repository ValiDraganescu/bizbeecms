# Note to the next Meeseeks (external-data-sources)

2026-07-02 10:35: Form slice (b) is DONE — the whole Form decomposition
(a/b/c/d + live AI e2e smoke) is now COMPLETE. Builder surface: Form draggable
from the rail (`{kind:"form"}` → addFormBlock), FormSettings panel
(source-agnostic target picker, expected-input-NAME chips — no map editor by
design, success/error messages, same-site redirect w/ invalid warning,
publicSubmissions-off alert), Collections UI publicSubmissions checkbox.
EN/FI/ET. Gates: tsc + 1398 + opennext worktree GREEN; ssr-bind-panel-check
extended to FormSettings (both kinds, warning on/off). JOURNAL 2026-07-02 10:35.

## FIRST: check ## Bugs (rule 0) — all DONE when I popped out.

## Good next task: the two AI-smoke findings TODOs (top of ## Tasks)
1. **Missing-block-id error message** (small, pure): page-blocks validation
   says "id must be a short identifier…" even when the id is ABSENT — make the
   absent case self-correcting ("missing — add a short unique id, e.g. …").
   Failing-first test.
2. **create_form optional `child` arg** (medium): one call → form + child
   component placed (addFormBlock already appends into a column; child-seeding
   is a small extension); removes the destructive get_page/update_page_blocks
   dance that twice clobbered the smoke page.
Both touch lib/chat + lib/pages — check git status for parallel in-flight work
on those files before starting.

## Also worth doing (smaller)
- Real-browser smoke of the new builder UI (drag a Form in, pick both target
  kinds, save/publish, submit live). Slice (b) was verified via the SSR
  display check + live API feed, not a browser session. The fixture page's
  fx-forms blocks are ready-made: select them in the builder and confirm the
  panel round-trips (they use FormProbeApi/FormProbeContact children).

With (b) landed, the Form track is done and this goal has repeatedly been
recommended for curator ARCHIVE — flag STRUCTURE in your result if the two
TODOs above are also done.

Gates: tsc + node suite + opennext (isolated-worktree recipe in CAVEATS; dev on
:3602 is live — never build in-repo while it runs; `npm run cf-typegen` in the
worktree before tsc).

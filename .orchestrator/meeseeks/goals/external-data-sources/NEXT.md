# Note to the next Meeseeks (external-data-sources)

2026-07-02 11:05: AI-smoke finding (1) is DONE — validateBlocks now emits a
self-correcting "id is missing — … e.g. \"contact-form-child\"" for
absent/empty block ids and names the exact bad token (80-char cap) for
malformed ones. Failing-first regression test; tsc + 1399 + opennext
isolated-worktree gate GREEN. JOURNAL 2026-07-02 11:05.

## FIRST: check ## Bugs (rule 0) — all DONE when I popped out.

## State of the goal
Slice (b) is COMMITTED (9b6f219) — forms a/b/c/d + live AI smoke all DONE.
The parallel meeseeks-eds-ui terminal may be idle; still check git status for
in-flight edits before touching page-builder UI files.

## Good next task: the last AI-smoke finding TODO (## Tasks)
**create_form: optional `child` component arg** (medium): one call → Form +
child component placed. addFormToSection exists in lib/pages/page-blocks.ts;
validate the component EXISTS (self-correcting error naming known components
if not). Update tool docs/prompts + form-tools tests; keep the
no-map-by-design contract. Pure-ish lib/chat + lib/pages work.

## Also worth doing (smaller)
- Real-browser smoke of the slice-(b) builder UI (drag a Form in, pick both
  target kinds, save/publish, submit live) — (b) was verified via the SSR
  display check, not a browser session. The fixture page's fx-forms blocks
  are ready-made.

When the child-arg TODO lands, the backlog is empty and this goal has
repeatedly been recommended for curator ARCHIVE — flag it in your result.

Gates: tsc + node suite + opennext (isolated-worktree recipe in CAVEATS; dev
on :3602 is live — never build in-repo while it runs; `npm run cf-typegen` in
the worktree before a standalone tsc).

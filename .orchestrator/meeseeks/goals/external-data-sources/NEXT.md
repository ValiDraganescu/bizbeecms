# Note to the next Meeseeks (external-data-sources)

2026-07-02 10:45: the LAST backlog TODO is DONE — create_form's optional
`child` component arg (one call → submittable Form with its input component
placed; unknown child → self-correcting error listing every component). Live
gpt-4o-mini smoke proved both target kinds AND in-round self-correction.
tsc + 1402 suite + opennext isolated-worktree gate GREEN.

## FIRST: check ## Bugs (rule 0) — all DONE when I popped out.

## State of the goal
Every task and bug in BACKLOG.md is DONE. All form slices (a–d), AI smoke,
both smoke findings, all 8 data-source slices, purge, oauth2, hardening —
shipped and gated. This goal has now been recommended for curator ARCHIVE by
multiple workers, me included — **flag ARCHIVE in your result too** if you
land here and nothing new has been reported.

## If you must pick work anyway (rule 3 — never idle)
- Real-browser smoke of the slice-(b) builder UI (drag a Form from the rail,
  pick both target kinds, save/publish, submit live) — (b) was verified via
  the SSR display check + live AI/API smokes, never a human-style browser
  session. The fixture page api-fixture-httpbingo's fx-forms cards are
  ready-made.
- Or re-read main/GOAL.md and invent the next valuable slice.

Gates: tsc + node suite + opennext (isolated-worktree recipe in CAVEATS —
copy uncommitted files in; `npm run cf-typegen` before a standalone tsc; dev
on :3602 is live, never build in-repo while it runs).

# Note to the next Meeseeks (external-data-sources)

2026-07-02 10:12: P2 stale-copy bug is DONE — bind/list panel copy is now
source-agnostic ("Bind to data source" etc.), EN/FI/ET, regression
`scripts/bind-copy.test.mjs` (stale-string lockout + bind/list key parity).
Worktree gate green (tsc + 1381 + opennext). ## Bugs is now EMPTY.

## Heads-up: parallel Meeseeks in flight
A parallel worker is doing Form AI TOOLS — uncommitted changes in
`lib/chat/tool-dispatch.ts`, `tool-scopes.ts`, `pages/page-blocks.ts`, new
`lib/chat/form-tools.ts` (backlog form slice (d), marked DOING). Repo-local
tsc FAILS on their in-flight state — that's theirs, don't fix or commit it.
Gate your own work in an isolated worktree (see CAVEATS; run
`npm run cf-typegen` there before tsc).

## Next task: Form slice (b) — page-builder UI (BACKLOG decomposition)
Bind a Form block → saved request OR opted-in collection; map fields →
placeholders/schema fields; author success/error messages + optional
redirect; publicSubmissions toggle in the Collections UI. EN/FI/ET.
Slices (a)+(c) are done — authoring is pure data (`block.formTarget`), and
the fixture page's fx-forms cards show exactly what persisted formTargets
look like. If slice (d) landed by the time you run, its tool arg shapes are
another reference. Keep `bindingKey` preservation intact if you touch the
bind panels (P1 caveat).

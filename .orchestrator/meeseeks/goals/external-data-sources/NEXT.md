# Note to the next Meeseeks (external-data-sources)

2026-07-02 09:51: Form block slice (a) is DONE (JOURNAL entry has the full
map). The Form built-in + PUBLIC dual-mode /api/forms/submit endpoint work
live for BOTH target kinds; 14 new node tests; tsc + 1375 suite + opennext
worktree gate all green.

## FIRST: an OPEN BUG outranks everything (BACKLOG ## Bugs)
[P2] Stale bind-panel copy: single-item bind panel still says "Bind to
collection" / "Fill this block's props from the first matching collection
item" although the picker now offers API sources too. Retitle source-
agnostically ("Bind to data source" + kind-neutral description), EN/FI/ET,
and check the List bind panel for the same stale wording. Likely files:
page-builder binding-panels.tsx + pageBuilder.* i18n keys (see the
`list.presentation*` localization run for the pattern). Take this before any
Form slice.

## Then: Form slice (b) — page-builder UI (see decomposition note in BACKLOG)
Bind a Form block → saved request OR opted-in collection; map fields →
placeholders/schema fields; author success/error messages + optional
redirect; publicSubmissions toggle in the Collections UI. EN/FI/ET. The
authoring side is pure data (`block.formTarget`) — slice (a) already renders
and submits whatever you persist. Then slice (c): Form cards on the
api-fixture-httpbingo page (POST echo request deec059d-72da-419d-8162-2081a64e5e71
on source 4cf4fb2a-…f22b) + a contact-form collection card; then (d) AI tools.

Read the 5 new Form caveats in CAVEATS.md (security model, forced
no-retry/no-cache, rate-limit lockout during live smokes, opt-in toggle,
formPageId stamping). Gates: tsc + node suite + opennext (isolated-worktree
recipe in CAVEATS; dev on :3602 is live, never build in-repo while it runs).

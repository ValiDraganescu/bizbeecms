# Note to the next Meeseeks (external-data-sources)

2026-07-02 12:12: shipped `get_data_sources_guide` — the on-demand data-sources/
bindings/forms playbook tool (first of the two USER AI-enablement TODOs). All
gates green (tsc, 1406 suite, opennext isolated worktree, live scope check).

## FIRST: check ## Bugs (rule 0) — all DONE when I popped out.

## Your task: the remaining USER TODO — inline data-sources context on /admin/data-sources
The USER confirmed it live mid-my-run (screenshots): the chat on
/admin/data-sources shows NO "Context attached" chip, page-builder does, they
want it there too. The BACKLOG TODO now carries the verified mechanism:
- `ContextChip` (components/chat/chat-conversation.tsx ~line 400) subscribes to
  page-context / component-context / collection-context stores; each admin page
  publishes into its store and the send path appends the active contexts.
- Build a data-sources-context store (PURE builder — names, auth kind, saved
  requests w/ method/path/placeholders/cache, NEVER secrets; cap + summarize
  overflow; mirror collection-context.ts + collection-context.test.ts), publish
  from the /admin/data-sources page, wire BOTH chat-conversation.tsx points
  (chip subscribe/snapshot + send-path collection).
- Node tests for the pure builder. EN/FI/ET only if you add UI strings (the
  chip label already exists: chat.contextAttached).

## Watch out
- The guide tool is STATIC — if your slice changes any data-source tool
  name/arg, update data-sources-guide.ts in the same commit (drift test:
  scripts/data-sources-guide.test.mjs).
- Gates: tsc + node suite + opennext (isolated-worktree recipe in CAVEATS —
  copy uncommitted files in; `npm run cf-typegen` before standalone tsc; dev on
  :3602 is live, never build in-repo while it runs).

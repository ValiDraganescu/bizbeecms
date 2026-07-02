# Note to the next Meeseeks (external-data-sources)

2026-07-02 12:28: shipped the SECOND (and last) queued USER AI-enablement TODO —
inline data-sources context on /admin/data-sources. Chip live-verified via
headless-Chrome CDP (scripts/live-ds-context-chip-check.mjs). All gates green
(tsc, 1412 suite, opennext isolated worktree, live chip check).

## FIRST: check ## Bugs (rule 0) — all DONE when I popped out.

## State: the backlog has NO open TODOs.
Both AI-enablement TODOs (guide tool + inline context) are DONE; every earlier
slice/bug is DONE. Before this run the goal was already declared saturated by
multiple workers and NEXT recommended the curator ARCHIVE it — that still
stands unless the user queued something new.

## If you must invent work (rule 3), candidates in value order:
1. Live AI smoke of the new inline context: one real /api/chat round from
   /admin/data-sources context ("pages" ctx + the context string prepended)
   proving the model uses a source by name WITHOUT calling list_data_sources.
2. The other admin pages with stores (collections) cap nothing — data-sources
   caps at 10/8; check with the user whether collections should cap too
   (do NOT change without directive).
3. Fresh-eyes defect hunt on the context publisher (races on rapid nav?).

## Watch out
- Inline-context stores wire into TWO files (chip: chat-conversation.tsx,
  send: chat-widget.tsx) — see the new caveat.
- The guide tool (get_data_sources_guide) is STATIC — any tool-surface change
  must update data-sources-guide.ts in the same commit (drift test).
- Gates: isolated-worktree opennext recipe in CAVEATS; dev on :3602 is live.

## STRUCTURE (for the curator)
Goal remains a candidate for ARCHIVE once the user confirms no more directives.

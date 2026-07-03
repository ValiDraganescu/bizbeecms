# Note to the next Meeseeks (external-data-sources)

2026-07-02 12:45: fixed the P2 sidebar-icon bug (Data sources nav item now has
a plug glyph; icon-lock regression in admin-nav.test.mjs, which now parses
ADMIN_SECTIONS from source instead of a drifted hand mirror). All gates green
(tsc, 1414 suite, live SSR on :3602, opennext isolated worktree).

## FIRST: check ## Bugs (rule 0) — all DONE when I popped out.

## State: the backlog has NO open TODOs.
Every slice, AI-enablement TODO, and bug is DONE. Multiple prior workers
declared the goal saturated and recommended the curator ARCHIVE it — that
still stands unless the user queued something new.

## If you must invent work (rule 3), candidates in value order:
1. Live AI smoke of the inline data-sources context: one real /api/chat round
   from /admin/data-sources ("pages" ctx + context string prepended) proving
   the model uses a source by name WITHOUT calling list_data_sources.
2. Fresh-eyes defect hunt on the context publisher (races on rapid nav?).

## Watch out
- Inline-context stores wire into TWO files (chip: chat-conversation.tsx,
  send: chat-widget.tsx).
- get_data_sources_guide is STATIC — any tool-surface change updates
  data-sources-guide.ts in the same commit (drift test).
- Gates: isolated-worktree opennext recipe in CAVEATS; dev on :3602 is live.
- New ADMIN_SECTIONS entries need a NavIcon case (see new caveat).

## STRUCTURE (for the curator)
Goal remains a candidate for ARCHIVE once the user confirms no more directives.

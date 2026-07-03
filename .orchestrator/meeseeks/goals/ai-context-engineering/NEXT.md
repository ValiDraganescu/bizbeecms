# Note to the next Meeseeks (ai-context-engineering)

The dedup/cap/opening task is DONE (JOURNAL 2026-07-03 13:17) — the BACKLOG is
now EMPTY. Every original GOAL.md "what good looks like" bullet is delivered:
stale-thread compaction, paging on all listers, context-gated system prompt,
data-sources context, dedup + caps + generic opening.

So: re-read GOAL.md and invent the next most valuable slice. Candidates left
by previous runs (roughly in value order):
1. Measure REAL steady-state thread costs: pull a few real threads from local
   D1 (chat threads table), compute replayed-history token totals before/after
   compaction kicks in — validates the >24h compactor actually pays off, and
   may motivate a size budget for LIVE turns (append-only, cache-safe: e.g.
   truncate a tool result ONCE at the moment it's first appended, never after).
2. Per-context tool-RESULT budgets: get_page on a big page is still ~4.7k tok
   every call; consider a `depth`/`fields` arg or a compact tree format.
3. A `develop`/`sitemap` admin context (check which /admin pages still fall
   through to general — e.g. /admin/develop, /admin/sitemap if they exist).
Add what you pick to BACKLOG.md first, then take it.

Watch-outs beyond CAVEATS.md: general prompt grew +7 tok this run (gated
composing paragraph) — fine, but don't let "one more always-on paragraph"
creep back; prefer gated sections or the guides.

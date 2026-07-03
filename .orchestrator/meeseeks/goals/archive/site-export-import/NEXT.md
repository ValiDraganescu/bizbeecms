# Note to the next Meeseeks (site-export-import)

Both halves of the 2026-07-03 user request are now DONE: one-file zip
EXPORT (prior run) and zip IMPORT (this run). The Import picker accepts
`site.zip` (unzips client-side, auto-pushes bundled asset bytes through the
existing `/api/site-import/asset/<key>` route, no separate file-picking) or
a bare `site.json` (backward compat, falls back to the manual multi-file
asset picker). Live-verified a full cross-instance round-trip on a scratch
instance: 61/61 real assets, one sha256-identical before/after. `npm test`
1505/1505, `tsc --noEmit` clean.

**Backlog status:** only two (duplicate) LOW-priority TODOs remain, both
already re-checked twice and found fine ("confirm-string UI copy nit" —
the expected site name is already shown prominently in `<strong>`, all 3
locales have real copy, disabled+error state on blank). Don't re-touch
those unless an operator actually reports confusion.

**There is no other queued work left in this goal's BACKLOG.** Per the
Meeseeks "never idle" rule, the next run should invent the next valuable
slice by re-reading `main/GOAL.md` + this goal's `GOAL.md` against the
current codebase. Candidates worth considering (not yet vetted, pick and
verify one):
- A UI polish pass on the Export/Import admin page (loading states,
  disabled-button copy, or moving it out of Settings into its own nav item
  if it's buried).
- Decide + implement whether FULL page-version HISTORY (not just current
  draft/live) should be exportable — FORMAT.md's original spec flagged this
  as "decide and note"; check what shipped vs what was deferred.
- A retention/size guard: `zipSync(..., {level:0})` on a genuinely huge
  gallery (hundreds of MB) could stress a low-memory browser tab — worth at
  least documenting the practical ceiling, or chunked progress UI, if this
  ever bites a real operator.
- Re-verify the whole goal's "very likely feature-complete" claim (past
  NEXT.md wording) end-to-end once more given zip export+import are both
  now shipped — a full GOAL.md re-read against the live admin UI to confirm
  nothing in the original spec (data-source secret re-entry flow, i18n
  coverage, collection-cap UX) was missed.

If none of those pan out, re-derive fresh candidates from GOAL.md's "What
good looks like" checklist — it's still the yardstick.

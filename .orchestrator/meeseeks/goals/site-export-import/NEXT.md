# Note to the next Meeseeks (site-export-import)

This run took the manager-hinted "2nd-instance tooling" TODO (checked the
"confirm-string UI copy nit" first as suggested — it's genuinely already
fine, see BACKLOG.md, no code change needed there). Built and live-verified
`CMS/scripts/scratch-instance.sh up [port]` / `down [port]`, which automates
the CAVEATS-documented manual recipe for spinning up a second, fully
isolated local CMS instance (own D1, own R2, own port) for cross-instance
E2E testing. Found + fixed 2 real bugs in the script itself before it
worked (wrong scratch-dir depth landing inside the repo; missing
`.env.local` causing every admin route to 401) — both are now CAVEATS
entries so nobody re-discovers them.

**Both of BACKLOG's "New TODOs found by the E2E slice" are now closed.**
BACKLOG.md's `## Tasks` section (the goal's original MVP scope) has been
all-DONE since the E2E-slice run; this run closed out the trailing polish
items too.

**This goal may genuinely be feature-complete for its GOAL.md scope**:
export (pages/components/collections/assets/settings/data-sources/prompts),
import (validate/execute/asset-upload, destructive with typed confirmation
and dry-run report), admin UI, a real cross-instance E2E pass (2 bugs found
+ fixed), wipe-loop atomicity hardening, and now reusable 2nd-instance
tooling for any FUTURE cross-instance verification need.

**If you're picking up this goal next**, reasonable options:
1. Re-read `GOAL.md` against current code for any deeper gap — e.g. the
   `MAX_READ_ROWS` (1000-row) cap on `contentSelect` is a known, flagged,
   NOT-yet-fixed limitation for collections with >1000 rows (see CAVEATS) —
   could decide to actually raise/paginate it, or confirm it's an accepted
   platform limit worth just documenting in FORMAT.md explicitly.
2. Use the new `scripts/scratch-instance.sh` for a SECOND independent E2E
   pass if you want extra confidence beyond the one already done (e.g. test
   an import where the target has EXISTING different content, not just an
   empty target — the E2E-slice run only tested empty-target import).
3. Flag to the curator that this goal may be ready to archive like the other
   delivered M2 tracks (page-builder, ai-assistant, binding-adapters,
   deploy-audit-trail, custom-domains) if the user agrees there's no more
   must-have work — this goal has now had a real cross-instance E2E pass,
   which is more verification than some already-archived tracks got.

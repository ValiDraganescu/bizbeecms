# Note to the next Meeseeks (deploy-audit-trail)

The full per-step audit trail is built, visible, de-duplicated, run-isolated, paged
(history pager), live-progress-aware, AND now shows each run's TOTAL duration.
`lib/deploy/deploy-events.ts` is the brain; `deploy-timeline.tsx` is the UI.

**NOTE:** the codebase has grown WELL past old backlog notes. Before picking a task,
`grep` the lib for the helper you're about to add — `groupRunsByDeployId`, `DeployRun`,
`listDeployEventsPaged`, `selectLatestRun`, `collapseDeployEvents`, `deployProgress`,
`fmtElapsed`, `runTotalDurationMs` ALL already exist. Don't reinvent.

**ONLY REMAINING BACKLOG TODO: "Verify end-to-end."** Operational/HITL — needs a REAL
live deploy (not dry-run): trigger a deploy → confirm a full ordered trail, EACH STEP
ONCE, ONLY the latest run's rows, build event shows `· {mb} MB free`, total duration shows,
terminal `callback` row surfaces on failure, and an emit failure (EVENTS_URL→500) does NOT
break the deploy. Likely needs the human. Don't trigger deploys yourself if one may be in flight.

**DRIVER ACTIONS (may still be pending — confirm before assuming live):**
- Apply migration 0004 to remote D1: `cd ProjectManager && npx wrangler d1 migrations apply bizbeecms`
- Redeploy BOTH workers (PM + `cd deployer && npx wrangler deploy`) so DEPLOY_ID emits live.

If no code TODO is actionable, invent the next valuable slice toward GOAL.md — e.g. a
per-step relative-time / "x ago" label, surfacing total in the deploy-form status, or a
copy-error button on failed rows. Always check it doesn't already exist first.

Gates: PM `npm test` + `npx opennextjs-cloudflare build`. Deployer gate = `wrangler deploy --dry-run`.
NEVER run opennextjs build while `npm run dev` is on 3601/3602.

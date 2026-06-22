# Backlog — cms-releases
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Build order: release tooling first (so tags + notes EXIST to deploy/show), then
deployer tag-list + notes endpoints, then PM version-record + display, then PM
version picker + notes UI. Each slice gates where it applies (PM/deployer tsc/build
green; EN/FI/ET for new PM strings).

- DONE: **Slice 1 — repo release skill (`commit` + `release`).** New
  `.claude/skills/<repo-commit-or-name>/SKILL.md` (normal files — workers can write
  skills). `commit`: ordinary commit/push (delegate to or mirror `/orc-commit`).
  `release`: (a) find the last `cms-v*` tag (`git describe --tags --match 'cms-v*'`
  / `git tag`), (b) list commits since it, (c) DRAFT `release-notes/<x.y.z>.md` from
  them (grouped feat/fix/etc.), (d) STOP for human edit, (e) on confirm: bump
  `CMS/package.json`, `git add` the notes + version, commit, annotated tag
  `cms-v<x.y.z>`, push tag + branch. Semver level inferred from the commit range,
  human-overridable. Document the flow in the SKILL body. (No app code; this is the
  tooling foundation.) Cut the FIRST real `cms-v*` tag with it so later slices have
  something to list.

- DONE: **Slice 2 — deployer: list tags + serve release notes.** Added to
  `deployer/src/index.ts` (auth: existing deployer bearer):
  `GET /tags` → `git ls-remote --tags $REPO_URL` (no clone), filter `cms-v<x.y.z>`,
  dedupe `^{}` peeled refs, return `{tags:[{version,tag}]}` newest-first; and
  `GET /release-notes?version=x.y.z` → shallow `git clone --depth 1 --branch
  cms-v<ver>` + `cat release-notes/<ver>.md` → `{version, markdown}` (404
  notesNotFound / 400 badRequest). Reuses `REPO_URL`/`GITHUB_TOKEN` via shared
  `gitAuthEnv()`; `exec({env})` so nothing is shell-interpolated. Gate: `wrangler
  deploy --dry-run` bundles clean. NOTE: real-remote verification waits on
  `cms-v0.6.0` being pushed (it's local only).

- TODO: **Slice 3 — PM: record deployed CMS version end-to-end.** Add
  `deployedCmsVersion` (text, nullable) to the `sites` table
  (`ProjectManager/src/db/schema.ts`) + Drizzle migration. Thread the chosen version
  through: PM deploy route sends `ref` = `cms-v<ver>` to the deployer; the deployer
  SUCCESS callback includes the version; PM callback ingest
  (`api/deploy-callback/route.ts` Body + `setSiteDeployStatus`) stores it on the
  site. (If wiring the chosen-version UI isn't done yet, default to recording
  whatever ref was deployed.) Node tests for the callback storing the version. Gate.

- TODO: **Slice 4 — PM: show deployed CMS version in site LIST + DETAIL.** Render
  `deployedCmsVersion` in `app/(app)/sites/page.tsx` (a column/badge next to the
  status) and `sites/[id]/page.tsx` (the detail grid, near workerName). Empty/never-
  deployed → a muted "—"/"not deployed". EN/FI/ET for the label. (This is the
  user's ORIGINAL ask — deliverable on its own once Slice 3 records the value.) Gate.

- TODO: **Slice 5 — PM: CMS version PICKER + release-notes viewer on deploy.** In the
  deploy flow (the deploy button/dialog in site detail): a version `<select>`
  populated from the deployer `GET /tags` (Slice 2) — TAGGED RELEASES ONLY (USER
  DECISION; no `main` option), default to latest; a "view release notes" action that
  fetches `GET /release-notes?version=` (Slice 2) and renders the markdown in a
  panel/modal; Deploy passes the chosen `cms-v<ver>` as `ref`. Reuse design-system +
  purpose tokens; in-app modal (no native dialog). EN/FI/ET. Gate.

- TODO (optional, later) — **upgrade indicator.** In the site list, flag sites whose
  `deployedCmsVersion` < the latest `cms-v*` tag ("update available"). Small,
  additive; only if useful after 1-5.

# Goal: cms-releases
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Turn "show the CMS version" into a full **CMS release + versioned-deploy** system:
cut tagged CMS releases with editable release notes, let PM **list available CMS
versions and choose which to install** on a Site (with notes shown before
installing), and **display each Site's deployed CMS version** in the list + detail.

USER DIRECTIVE (2026-06-22, expanded from "show CMS version in site list/details"):
"I should be able to select which CMS version to install … introduce CMS git
tagging, list the tags and choose what to install. Have release-notes/x.y.z.md
displayed in PM so we know what's in an update. Add a repo-specific commit skill
with a `release` command that checks what's been implemented since the last tag,
creates release notes, and tags the new version following semver."

## The settled architecture (decided with user 2026-06-22)
- **Tag scheme: `cms-v<x.y.z>`** (CMS-scoped — it's a monorepo; PM has its own
  version). Source of truth for "what can be deployed".
- **Deploy targets: TAGGED RELEASES ONLY** (USER DECISION) — PM lists `cms-v*` tags;
  you must pick a released version. `main` is NOT directly deployable from PM.
- **Release notes: auto-DRAFT from commits, you EDIT, then it tags** (USER DECISION).
  Notes live at `release-notes/<x.y.z>.md` in the repo; PM displays them.
- **Release tooling is a REPO-SPECIFIC skill** (NOT the generic `/orc-commit`):
  - normal committing stays free (delegate to / mirror `/orc-commit`).
  - a `release` command: diff commits since the last `cms-v*` tag → draft
    `release-notes/<x.y.z>.md` → (human edits) → bump `CMS/package.json` → annotated
    tag `cms-v<x.y.z>` (semver picked from the change set) → push tag + notes.
- **Deployer already supports a chosen ref**: `POST /deploy` accepts an optional
  `ref` (validated, defaults to `main`) and clones `--branch "$REF"` — a TAG works as
  a ref. PM just doesn't pass one yet. So "deploy a chosen tag" is mostly WIRING.
- **CMS version recorded on the Site** (the original ask, now the read-side):
  thread the chosen version through the deploy callback → a `deployedCmsVersion`
  column on `sites` → shown in list + detail.

## What "good" looks like
- A repo skill cuts a release: `release-notes/0.7.0.md` drafted from commits, edited,
  `CMS/package.json` → 0.7.0, annotated tag `cms-v0.7.0` pushed.
- PM deploy flow shows a **CMS version picker** (lists `cms-v*` tags via the
  deployer), a **"view release notes"** action (renders `release-notes/<ver>.md`),
  and deploys the chosen tag (passes `ref` to the deployer — already supported).
- The **deployed CMS version shows in the PM site list + site detail** for every
  Site, recorded at deploy time via the callback.
- Gate every slice: relevant app (PM/deployer) `tsc`/build green where it applies;
  EN/FI/ET for new PM UI strings.

## Reference (current state, verified 2026-06-22)
- Deployer: `deployer/src/index.ts` — `DeployBody = {siteId, slug, ref?}` (~27);
  `ref` defaults to `"main"` (~84); `git clone --depth 1 --branch "$REF" "$REPO_URL"`
  (~432); clones the monorepo (`git@github.com:ValiDraganescu/bizbeecms.git`), builds
  in `CMS/`. `REPO_URL`/`GITHUB_TOKEN` are deployer secrets. Success callback
  `{siteId, deployId, status, workerName}` (~324) — NO version field yet.
- PM trigger: `app/api/sites/[id]/deploy/route.ts` sends `{siteId, slug}` (~69) —
  does NOT pass `ref` today.
- PM callback ingest: `app/api/deploy-callback/route.ts` (`Body = {siteId, status,
  workerName, error}`) → `setSiteDeployStatus`. NO version field.
- `sites` table (`ProjectManager/src/db/schema.ts:60`) — NO version column.
  `deployEvents` table (~119) — NO version field.
- Site UI: `app/(app)/sites/page.tsx` (list, status badge ~106) +
  `sites/[id]/page.tsx` (detail grid ~109) — no version shown.
- Versions: `CMS/package.json` + `ProjectManager/package.json` both `0.6.0`. Only
  one tag exists (`v0`); no `cms-v*` tags yet, no `release-notes/`, no CHANGELOG.
- Skills: `.claude/skills/orc-commit` is the only version tool (bumps + commits +
  pushes; does NOT tag). No repo-specific commit/release skill yet.

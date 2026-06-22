# Caveats — cms-releases
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **The deployer ALREADY supports a chosen ref — don't rebuild it.** `POST /deploy`
  accepts `ref?` (validated `^[\w.\-/]+$`, defaults to `"main"`) and clones
  `git clone --depth 1 --branch "$REF"` — a TAG is a valid `--branch` arg. The gap is
  only: PM doesn't PASS a ref, and there's no tag-LIST endpoint. Add those; don't
  touch the working clone/build.

- **Tag scheme is `cms-v<x.y.z>`** (CMS-scoped — monorepo, PM versions separately).
  Filter tag lists to `cms-v*`. The release skill creates these; PM lists these.

- **TAGGED RELEASES ONLY from PM** (USER DECISION) — the version picker lists `cms-v*`
  tags; `main` is NOT a PM-selectable deploy target. (The deployer still defaults to
  main if no ref is sent, but PM always sends a chosen tag.)

- **Release notes: auto-DRAFT → human EDIT → tag** (USER DECISION). The release
  command drafts `release-notes/<x.y.z>.md` from commits since the last `cms-v*` tag,
  the human edits, THEN it bumps + tags + pushes. Do NOT auto-tag without the edit
  step.

- **Release tooling is a REPO-SPECIFIC skill, NOT `/orc-commit`.** `/orc-commit` is
  the generic bump+commit+push (it does NOT tag). The new skill lives in
  `.claude/skills/<name>/SKILL.md` (normal files — a worker CAN create it). It may
  delegate ordinary commits to `/orc-commit` but OWNS the `release` command (notes +
  semver tag). Don't bolt release logic into `/orc-commit`.

- **Semver from the change set.** The `release` command should pick major/minor/patch
  the way `/orc-commit` reasons about a diff (breaking/feature/fix), but applied to
  the commit RANGE since the last `cms-v*` tag, not a single diff. The human can
  override the level.

- **Listing tags: `git ls-remote --tags $REPO_URL`** from the deployer (it has
  `REPO_URL`/`GITHUB_TOKEN`), or `gh api repos/.../tags`. A new deployer `GET /tags`
  (auth: existing deployer bearer) returning the `cms-v*` list is the clean path —
  PM calls it. Don't make PM clone the repo.

- **Release notes display: read `release-notes/<ver>.md`** from the repo at that tag
  (a deployer endpoint that `git show cms-v<ver>:release-notes/<ver>.md`, or GitHub
  raw at the tag). PM renders it (markdown). Pick the simplest that works with the
  deployer's existing git auth.

- **Record the deployed version end-to-end.** Thread the chosen version: PM deploy →
  deployer (`ref`) → success callback must now include the version → PM stores it in
  a NEW `sites.deployedCmsVersion` column (Drizzle migration) → list + detail render
  it. The callback Body type + `setSiteDeployStatus` both need the new field.

- **Gate:** PM/deployer `tsc`/build green where touched. EN/FI/ET for new PM UI
  strings (version picker, "view release notes", version badge). No native
  confirm()/alert() in PM UI.

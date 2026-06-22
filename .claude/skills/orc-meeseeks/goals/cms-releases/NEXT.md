# Note to the next Meeseeks (cms-releases)

First run — no prior task work. Read `../main/GOAL.md`, then this goal's `GOAL.md`
and `CAVEATS.md` before touching anything.

PICK NEXT: **Slice 1 — the repo release skill (`commit` + `release`).** It's the
foundation: nothing can list/deploy/show a version until tags + `release-notes/*.md`
EXIST. Build the `.claude/skills/<name>/SKILL.md` (workers CAN write skills — normal
files), with `release` = draft notes from commits since the last `cms-v*` tag →
human edit → bump CMS/package.json → annotated tag `cms-v<x.y.z>` → push. Then cut
the FIRST `cms-v*` tag so later slices have data.

KEY DECISIONS (settled with user 2026-06-22 — don't relitigate):
- Tag scheme: `cms-v<x.y.z>` (CMS-scoped; monorepo).
- PM deploys TAGGED RELEASES ONLY (no `main` option in the picker).
- Release notes: auto-DRAFT from commits → human EDIT → tag (not fully auto, not
  fully manual).
- Release tooling is a REPO-SPECIFIC skill, NOT `/orc-commit` (which only
  bumps+commits+pushes, no tags). The skill may delegate plain commits to it.

VERIFIED 2026-06-22:
- Deployer ALREADY accepts `ref?` (defaults `main`) + clones `--branch "$REF"` — a
  tag works. PM just doesn't pass a ref, and there's no tag-list endpoint. The clone
  URL/token are deployer secrets (`REPO_URL`/`GITHUB_TOKEN`).
- Monorepo `git@github.com:ValiDraganescu/bizbeecms.git`; CMS builds from `CMS/`.
- NO version column on `sites`, NO release-notes/, only one tag (`v0`).
- CMS + PM both at 0.6.0 in package.json.
- List tags via `git ls-remote --tags $REPO_URL` from the deployer; show notes via
  `git show cms-v<ver>:release-notes/<ver>.md` (or GitHub raw at the tag).

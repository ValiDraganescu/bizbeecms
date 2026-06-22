---
description: Repo-specific CMS release tooling for bizbeecms. `commit` ships ordinary changes (delegates to /orc-commit). `release` cuts a CMS release — drafts release-notes/<x.y.z>.md from commits since the last cms-v* tag, STOPS for human edit, then bumps CMS/package.json, commits, annotated-tags cms-v<x.y.z>, and pushes the tag + branch.
argument-hint: "[commit | release [major|minor|patch]] — default: release"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# bizbeecms CMS release tool

This is the **repo-specific** release skill. The CMS is deployed per-Site from a
**git tag** (`cms-v<x.y.z>`), so cutting a tagged release with editable notes is the
source of truth for "what PM can deploy". Two commands:

- `commit` — ship ordinary working-tree changes. **Delegate to `/orc-commit`** (it
  bumps the right version file, commits, pushes). No tagging. Use this for normal work.
- `release` — cut a CMS release: draft notes → **human edits** → bump → tag → push.

The first token of `$ARGUMENTS` is the command (`commit` or `release`); default
`release`. For `release`, an optional second token forces the semver level
(`major|minor|patch`), overriding the inferred level.

---

## `commit` — ordinary ship

Just run the generic commit/push flow: invoke `/orc-commit`. Done. (It inspects the
diff, bumps the dominant project's version file, commits with a conventional subject,
pushes the current branch.) Nothing CMS-release-specific happens here — no tag.

---

## `release` — cut a tagged CMS release

The tag scheme is **`cms-v<x.y.z>`** (CMS-scoped; this is a monorepo and PM versions
separately). The canonical version file is **`CMS/package.json`** (`"version"`).

### Step 0 — Pre-flight
Run in parallel:
- `git rev-parse --show-toplevel` (work from the repo root)
- `git status --short` (the tree should be clean OR only contain the release notes you
  intend to ship — if there's unrelated uncommitted work, STOP and tell the user to
  `commit` first; a release must be reproducible from a clean tree)
- `git fetch --tags` (so the "last tag" check sees remote tags)
- `git rev-parse --abbrev-ref HEAD` (the branch you'll push)

### Step 1 — Find the last cms-v* tag and the commit range
```bash
LAST=$(git tag -l 'cms-v*' --sort=-v:refname | head -1)
```
- If `LAST` is empty → this is the **first** release. The range is "all history"
  (`git log --oneline`); seed the new version from `CMS/package.json` (don't go
  backwards).
- Else the range is `"$LAST"..HEAD`:
  ```bash
  git log --oneline "$LAST"..HEAD
  git log --format='%s%n%b' "$LAST"..HEAD   # full subjects+bodies for grouping
  ```
- If the range is **empty** (HEAD is already at the last tag), STOP — nothing to
  release. Tell the user.

### Step 2 — Pick the semver level from the COMMIT RANGE
Apply `/orc-commit`'s reasoning (breaking → major, additive feature → minor, fix/
chore/refactor/docs/test → patch) but across the **whole range of commits since the
last tag**, not a single diff. Take the **highest** level present in the range.
- Conventional prefixes help: a `feat!:`/`BREAKING CHANGE` → major; any `feat:` →
  minor; otherwise patch. These commits use `meeseeks(<goal>): ...` subjects, so read
  the actual content, not just the prefix.
- Current version = `CMS/package.json` `"version"`. Compute the next:
  major → `X+1.0.0`, minor → `X.Y+1.0`, patch → `X.Y.Z+1`.
- The user can override via the `$ARGUMENTS` second token (`major|minor|patch`). If the
  range is ambiguous (mixes a clear breaking change with unrelated work), ask one sharp
  question before choosing.

Call the result `NEW=<x.y.z>`.

### Step 3 — DRAFT `release-notes/<NEW>.md` (then STOP for human edit)
Create the file `release-notes/<NEW>.md` (create the `release-notes/` dir if missing).
Group the commits since `LAST` into sections; drop pure-chore/memory commits if they
add no user value. Template:
```markdown
# CMS v<NEW>

_<YYYY-MM-DD> · changes since <LAST or "first release">_

## Features
- <one line per feature, plain language — what a CMS user/operator gets>

## Fixes
- <bug fixes>

## Other
- <refactors, infra, docs worth mentioning>
```
Drafting rules:
- Translate `meeseeks(goal): ...` subjects into **user-facing** language; don't just
  paste commit subjects. A release note tells the operator what changed for them.
- Omit empty sections.
- Timestamp the line with `date "+%Y-%m-%d"`.

**Then STOP and hand off to the human.** Print:
> Drafted `release-notes/<NEW>.md` (level: <level>, <old> → <NEW>). Edit it, then say
> "continue" / re-run `release` to tag.

Do **not** bump, commit, or tag yet. The human edit step is mandatory (USER DECISION).
If the user has clearly already edited and asked to proceed (e.g. they re-ran with the
notes file present and confirmed), continue to Step 4.

### Step 4 — Bump, commit, annotated-tag, push (after human confirms)
Only run this once the notes are edited and the user confirms.
1. Bump `CMS/package.json` `"version"` → `<NEW>` (edit only that field; preserve JSON
   formatting).
2. Stage **only** the version file + the notes (never `git add -A`):
   ```bash
   git add -- CMS/package.json "release-notes/<NEW>.md"
   ```
3. Commit (conventional subject; match repo log style):
   ```bash
   git commit -m "$(cat <<'EOF'
   chore(release): CMS v<NEW>

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```
4. Annotated tag on that commit, message = the notes title:
   ```bash
   git tag -a "cms-v<NEW>" -m "CMS v<NEW>"
   ```
5. Push the branch **and** the tag:
   ```bash
   git push origin "$(git rev-parse --abbrev-ref HEAD)"
   git push origin "cms-v<NEW>"
   ```
   Do not force-push. If on `main` and the repo's flow requires a PR, push the tag only
   and tell the user the branch needs its normal review.

### Step 5 — Report
One or two lines: `cms-v<NEW>` tagged + pushed, notes at `release-notes/<NEW>.md`, the
chosen level and old→new. PM's deployer `GET /tags` will now list it.

---

## Notes
- The deployer clones `--branch "$REF"` where `REF` can be a tag, so PM deploying
  `cms-v<NEW>` works once the tag is pushed. This skill only produces tags + notes; the
  deployer/PM wiring is separate slices.
- `cms-v*` is CMS-only. If you ever need to version PM, that's a separate scheme — do
  not reuse `cms-v*` for PM.
- Never tag without the human-edited notes. Never auto-push a tag the user hasn't seen
  notes for.

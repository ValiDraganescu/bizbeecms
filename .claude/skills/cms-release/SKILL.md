---
description: Repo-specific CMS release tooling for bizbeecms. `commit` ships ordinary changes (delegates to /orc-commit). `release` cuts a CMS release end-to-end — commits & pushes any pending work first, then drafts release-notes/<x.y.z>.md from commits since the last r-* tag, bumps CMS/package.json, commits, annotated-tags r-<x.y.z>, and pushes the tag + branch (no confirmation pause).
argument-hint: "[commit | release [major|minor|patch]] — default: release"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# bizbeecms CMS release tool

This is the **repo-specific** release skill. The CMS is deployed per-Site from a
**git tag** (`r-<x.y.z>`, `r` = release), so cutting a tagged release with editable notes
is the source of truth for "what PM can deploy". The `r-` prefix is deliberate: the old
`cms-v*` series had historical collisions (a version number recut onto a different
commit), so the `r-` scheme starts clean and the deployer keys off `r-*`. Two commands:

- `commit` — ship ordinary working-tree changes. **Delegate to `/orc-commit`** (it
  bumps the right version file, commits, pushes). No tagging. Use this for normal work.
- `release` — cut a CMS release end-to-end: commit & push pending work → draft notes →
  bump → tag → push (no pause).

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

The tag scheme is **`r-<x.y.z>`** (`r` = release; CMS-scoped — this is a monorepo and PM
versions separately). The canonical version file is **`CMS/package.json`** (`"version"`).
Legacy `cms-v*` tags exist but are retired (historical collisions); always cut and look
up `r-*` now.

### Step 0 — Pre-flight
Run in parallel:
- `git rev-parse --show-toplevel` (work from the repo root)
- `git status --short` (see what's pending — Step 0.5 commits it)
- `git fetch --tags` (so the "last tag" check sees remote tags)
- `git rev-parse --abbrev-ref HEAD` (the branch you'll push)

### Step 0.5 — Commit & push any pending work first
A release must be reproducible from a clean tree, so if `git status --short` shows
anything, commit it all and push **before** computing the range:
```bash
git add -A
git commit -m "<conventional subject summarizing the pending work>"   # read the diff to write it
git push origin "$(git rev-parse --abbrev-ref HEAD)"
```
Then re-check `git status --short` — it must be clean before Step 1. (The user has
opted into this: `release` commits pending work, pushes, then tags, all in one go.)

### Step 1 — Find the last r-* tag and the commit range
```bash
LAST=$(git tag -l 'r-*' --sort=-v:refname | head -1)
```
- If `LAST` is empty → this is the **first** `r-` release. The range is "all history"
  (`git log --oneline`); seed the new version from `CMS/package.json` (don't go
  backwards). Ignore the retired `cms-v*` tags for the range.
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

### Step 3 — Write `release-notes/<NEW>.md`
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

Write the notes, then continue straight to Step 4 — do not pause for confirmation.
(The user has opted into auto-release: draft → bump → tag → push in one go. They can
always edit the notes and re-tag afterward if needed.)

### Step 3.6 — Regenerate the releases manifest
The PM serves the version picker AND the in-app release notes from a **baked-in**
manifest — `ProjectManager/src/lib/deploy/releases.generated.json` — NOT from the
deployer (the deployer's `/tags` + `/release-notes` were deleted). So after writing
`release-notes/<NEW>.md`, regenerate the manifest from ALL `release-notes/*.md`. It is
**pre-trimmed** (last 3 majors / last 5 minors per major / last patch per minor) and
**inlines** each note's markdown, so the PM routes are a pure static read. Run:
```bash
node --input-type=module -e '
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const dir = "release-notes";
const parts = v => v.split(".").map(Number);
const cmpDesc = (a,b) => { const pa=parts(a),pb=parts(b); for(let i=0;i<3;i++) if(pa[i]!==pb[i]) return pb[i]-pa[i]; return 0; };
const all = readdirSync(dir).filter(f => /^\d+\.\d+\.\d+\.md$/.test(f))
  .map(f => { const version=f.replace(/\.md$/,""); return { version, tag:`r-${version}`, markdown:readFileSync(`${dir}/${f}`,"utf8") }; })
  .sort((a,b)=>cmpDesc(a.version,b.version));
const majors=[], minorsByMajor=new Map(), out=[];
for (const r of all) {
  const [maj,min]=parts(r.version);
  if(!majors.includes(maj)){ if(majors.length>=3) continue; majors.push(maj); }
  let minors=minorsByMajor.get(maj); if(!minors) minorsByMajor.set(maj,minors=[]);
  if(!minors.includes(min)){ if(minors.length>=5) continue; minors.push(min); out.push(r); }
}
writeFileSync("ProjectManager/src/lib/deploy/releases.generated.json", JSON.stringify({ releases: out }, null, 2)+"\n");
console.log("manifest:", out.map(r=>r.version).join(", "));
'
```
This is the SINGLE source of truth for "what PM shows". The trim rule lives here AND
mirrors `trimReleases` in `ProjectManager/src/lib/deploy/cms-releases.ts` (keep them in
sync if the rule changes).

### Step 4 — Bump, commit, annotated-tag, push
1. Bump `CMS/package.json` `"version"` → `<NEW>` (edit only that field; preserve JSON
   formatting).
2. Stage **only** the version file + the notes + the regenerated manifest (never
   `git add -A`):
   ```bash
   git add -- CMS/package.json "release-notes/<NEW>.md" \
     ProjectManager/src/lib/deploy/releases.generated.json
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
   git tag -a "r-<NEW>" -m "CMS v<NEW>"
   ```
5. Push the branch **and** the tag:
   ```bash
   git push origin "$(git rev-parse --abbrev-ref HEAD)"
   git push origin "r-<NEW>"
   ```
   Do not force-push. If on `main` and the repo's flow requires a PR, push the tag only
   and tell the user the branch needs its normal review.

### Step 5 — Report
One or two lines: `r-<NEW>` tagged + pushed, notes at `release-notes/<NEW>.md`, the
chosen level and old→new. The regenerated `releases.generated.json` means PM lists
`<NEW>` in the picker as soon as PM is redeployed (it's baked into the PM bundle).

---

## Notes
- The deployer clones `--branch "$REF"` where `REF` can be a tag, so PM deploying
  `r-<NEW>` works once the tag is pushed. This skill only produces tags + notes; the
  deployer/PM wiring is separate slices.
- `cms-v*` is CMS-only. If you ever need to version PM, that's a separate scheme — do
  not reuse `cms-v*` for PM.
- Notes are auto-drafted and the tag is cut without a confirmation pause. Still draft
  honest, user-facing notes — the user can edit and re-tag afterward if they want.

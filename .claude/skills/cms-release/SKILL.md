---
description: Repo-specific release tooling for bizbeecms (monorepo). `commit` ships ordinary changes (delegates to /orc-commit). `release` cuts a release for EVERY system that changed since its last tag — CMS (r-<x.y.z>), ProjectManager (pm-v<x.y.z>), deployer (deployer-v<x.y.z>), router (router-v<x.y.z>) — commits pending work (no push yet), drafts per-system release notes, bumps each system's package.json, regenerates the PM manifest, ONE release commit, one annotated tag per released system, then pushes branch + tags in ONE push (single CI deploy; no confirmation pause).
argument-hint: "[commit | release [major|minor|patch] [cms|pm|deployer|router ...]] — default: release (all changed systems)"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# bizbeecms release tool

This is the **repo-specific** release skill for a **monorepo with four independently
deployed systems**. Each system has its own version (its `package.json`) and its own
tag series — a release tags **every system that changed**, not just the CMS:

| system   | dir              | tag series          | version file                | deployed by                                        |
|----------|------------------|---------------------|-----------------------------|----------------------------------------------------|
| cms      | `CMS/`           | `r-<x.y.z>`         | `CMS/package.json`          | per-Site by the deployer container **from the tag** |
| pm       | `ProjectManager/`| `pm-v<x.y.z>`       | `ProjectManager/package.json` | CI on push to main (path filter `ProjectManager/**`, `CMS/**`) |
| deployer | `deployer/`      | `deployer-v<x.y.z>` | `deployer/package.json`     | CI on push to main (path filter `deployer/**`)     |
| router   | `router/`        | `router-v<x.y.z>`   | `router/package.json`       | CI on push to main (path filter `router/**`)       |

Only the CMS tag is *consumed* by machinery (deployer clones `--branch r-<x.y.z>`; PM's
version picker is built from `release-notes/*.md`). The other tags are the **record of
what was shipped** — a PM/deployer/router version → commit mapping — so you can diff,
bisect and roll back per system. The `r-` prefix is deliberate: the old `cms-v*` series
had historical collisions, so `r-` starts clean and the deployer keys off `r-*`. `cms-v*`
and the stray `v0` are retired; never cut them.

Two commands:

- `commit` — ship ordinary working-tree changes. **Delegate to `/orc-commit`** (it
  bumps the right version file, commits, pushes). No tagging. Use this for normal work.
- `release` — cut releases end-to-end: commit pending work → detect which systems
  changed → draft notes → bump → tag each → one combined push of branch + tags (no
  pause; single push = single CI run).

Arguments: the first token is the command (`commit` or `release`); default `release`.
For `release`, optional further tokens: a semver level (`major|minor|patch`) forcing
the level for **all** released systems, and/or system names (`cms pm deployer router`)
restricting the release to those systems (they are still only released if changed —
"nothing changed" is reported, not forced).

---

## `commit` — ordinary ship

Just run the generic commit/push flow: invoke `/orc-commit`. Done. No tag.

---

## `release` — cut tagged releases for every changed system

### Step 0 — Pre-flight
Run in parallel:
- `git rev-parse --show-toplevel` (work from the repo root)
- `git status --short` (see what's pending — Step 0.5 commits it)
- `git fetch --tags` (so the "last tag" checks see remote tags)
- `git rev-parse --abbrev-ref HEAD` (the branch you'll push)

### Step 0.5 — Commit any pending work (DO NOT push yet)
A release must be reproducible from a clean tree, so if `git status --short` shows
anything, commit it all **before** computing ranges — but **do not push here**.
Pushing now would trigger a CI deploy for the work commit AND another for the release
commit. All pushing is deferred to Step 4 (single push = single CI run).
```bash
git add -A
git commit -m "<conventional subject summarizing the pending work>"   # read the diff to write it
```
Then re-check `git status --short` — it must be clean before Step 1.

### Step 1 — Per system: last tag + commit range + "did it change?"
For each system, find its last tag and the commits since it that touched **its dir**,
ignoring previous release commits (they touch version files / notes / the manifest and
must not count as changes):
```bash
last() { git tag -l "$1" --sort=-v:refname | head -1; }
LAST_CMS=$(last 'r-*');       LAST_PM=$(last 'pm-v*')
LAST_DEP=$(last 'deployer-v*'); LAST_RTR=$(last 'router-v*')

changes() {  # $1 = last tag (or empty), $2... = paths
  local from="$1"; shift
  git log --oneline --no-merges --invert-grep --grep='^chore(release)' \
    ${from:+"$from"..}HEAD -- "$@"
}
changes "$LAST_CMS" CMS
changes "$LAST_PM"  ProjectManager
changes "$LAST_DEP" deployer
changes "$LAST_RTR" router
```
- A system with an **empty** list is **not released** (no bump, no tag). If **all** are
  empty → STOP, nothing to release; tell the user.
- **First tag for a system** (`LAST_*` empty — true today for pm/deployer/router until
  they get their first tag): don't walk all history. Use the last `r-*` tag as the range
  start for change detection and notes, and seed the version from the system's
  `package.json` (bump from there; never go backwards).
- Shared files (`scripts/`, `docs/`, root `*.md`, `.github/`) belong to no system;
  don't release anything for them alone. Exception: `.github/workflows/deploy.yml`
  changes count for whichever systems' jobs they touch — use judgement.
- Read the full subjects+bodies for each non-empty range (`git log --format='%s%n%b'`)
  — you'll need them for the level and the notes.

### Step 2 — Semver level, per system
Apply `/orc-commit`'s reasoning (breaking → major, additive feature → minor, fix/chore/
refactor/docs/test → patch) over **that system's** commit range; take the highest level
present. A `feat:` in `CMS/` bumps the CMS minor but says nothing about the deployer.
- Current version = the system's `package.json` `"version"`. Compute next: major →
  `X+1.0.0`, minor → `X.Y+1.0`, patch → `X.Y.Z+1`.
- A level token in the arguments overrides the inferred level for all released systems.
  Ambiguous range (clear breaking change mixed with unrelated work) → ask one sharp
  question before choosing.
- Cross-cutting features (e.g. a PM route + a deployer endpoint) are a `feat` for
  **each** system they touch.

Call the results `NEW_CMS`, `NEW_PM`, `NEW_DEP`, `NEW_RTR` (only for changed systems).

### Step 3 — Release notes, per system
Notes live under `release-notes/`:
- **cms** → `release-notes/<NEW_CMS>.md` (root — the PM manifest reads exactly these)
- **pm** → `release-notes/pm/<NEW_PM>.md`
- **deployer** → `release-notes/deployer/<NEW_DEP>.md`
- **router** → `release-notes/router/<NEW_RTR>.md`

Template (title prefix per system: `CMS`, `ProjectManager`, `Deployer`, `Router`):
```markdown
# <System> v<NEW>

_<YYYY-MM-DD> · changes since <LAST tag or "first tagged release">_

## Features
- <one line per feature, plain language — what a user/operator gets>

## Fixes
- <bug fixes>

## Other
- <refactors, infra, docs worth mentioning>
```
Drafting rules:
- Translate commit subjects into **user-facing** language; don't paste subjects.
- A commit touching two systems appears in **both** notes, phrased for each audience
  (CMS notes: site editors/AI users; PM notes: operators/admins; deployer/router: infra).
- Omit empty sections. Timestamp with `date "+%Y-%m-%d"`.

Write the notes, then continue straight on — do not pause for confirmation (the user
has opted into auto-release; they can edit notes and re-tag afterwards).

### Step 3.6 — Regenerate the PM releases manifest (only when cms is released)
The PM serves the CMS version picker AND in-app release notes from a **baked-in**
manifest — `ProjectManager/src/lib/deploy/releases.generated.json`. Regenerate it from
the **root** `release-notes/*.md` (subdirs are ignored by design). Pre-trimmed (last 3
majors / last 5 minors per major / last patch per minor), notes inlined:
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
The trim rule here mirrors `trimReleases` in
`ProjectManager/src/lib/deploy/cms-releases.ts` — keep them in sync.

### Step 4 — Bump, ONE commit, one tag per system, ONE push
1. Bump `"version"` in each released system's `package.json` (edit only that field;
   preserve formatting). Note `CMS/package.json` `"version"` is the CMS source of truth
   for `r-*`.
2. Stage **only** the version files + notes + (if cms) the manifest — never `git add -A`:
   ```bash
   git add -- CMS/package.json "release-notes/<NEW_CMS>.md" \
     ProjectManager/src/lib/deploy/releases.generated.json \
     ProjectManager/package.json "release-notes/pm/<NEW_PM>.md" \
     deployer/package.json "release-notes/deployer/<NEW_DEP>.md" \
     router/package.json "release-notes/router/<NEW_RTR>.md"      # only the ones released
   ```
3. One release commit listing every system released:
   ```bash
   git commit -m "$(cat <<'EOF'
   chore(release): CMS v<NEW_CMS>, PM v<NEW_PM>, deployer v<NEW_DEP>

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```
   (Subject names only the systems actually released — e.g. `chore(release): PM v0.7.0`
   when nothing else changed.)
4. One annotated tag **per released system**, all on that commit:
   ```bash
   git tag -a "r-<NEW_CMS>"         -m "CMS v<NEW_CMS>"
   git tag -a "pm-v<NEW_PM>"        -m "ProjectManager v<NEW_PM>"
   git tag -a "deployer-v<NEW_DEP>" -m "Deployer v<NEW_DEP>"
   git tag -a "router-v<NEW_RTR>"   -m "Router v<NEW_RTR>"
   ```
5. Push the branch **and all new tags** in **one** push — the ONLY push in the flow:
   ```bash
   git push origin "$(git rev-parse --abbrev-ref HEAD)" r-<NEW_CMS> pm-v<NEW_PM> ...
   ```
   Do not force-push.

### Step 5 — Report
One line per released system: `<tag>` tagged + pushed, old→new + level, notes path.
Mention systems that were **not** released (unchanged) in one trailing line. If cms was
released: PM lists `<NEW_CMS>` in the picker once PM is redeployed (baked-in manifest —
the same push redeploys PM because `CMS/**` and `ProjectManager/**` changed). If
deployer/router were released: CI redeploys them from this push; recall a deployer
rollout kills in-flight site deploys — wait a few minutes before redeploying Sites.

---

## Notes
- The deployer clones `--branch "$REF"` where `REF` is an `r-*` tag, so PM deploying
  `r-<NEW_CMS>` works once the tag is pushed. `pm-v*` / `deployer-v*` / `router-v*` are
  bookkeeping tags — nothing consumes them; CI deploys from the push to main.
- Never reuse a version number on a different commit. If a tag must be recut, bump.
- Notes are auto-drafted and tags are cut without a confirmation pause. Still draft
  honest, user-facing notes.

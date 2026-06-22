# Journal — cms-releases
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 12:05 — Slice 1: repo release skill + first cms-v* tag
- **Status:** DONE
- **What I did:** Created `.claude/skills/cms-release/SKILL.md` — repo-specific release
  tooling. `commit` delegates to `/orc-commit` (no tag). `release` = find last `cms-v*`
  tag → list commits in `LAST..HEAD` → pick semver level from the RANGE (human-
  overridable via 2nd arg) → DRAFT `release-notes/<x.y.z>.md` → **STOP for human edit**
  → on confirm bump `CMS/package.json`, commit `chore(release): CMS v<NEW>`, annotated
  tag `cms-v<NEW>`, push branch + tag. Then cut the FIRST tag so later slices have data:
  drafted `release-notes/0.6.0.md` (baseline, CMS already at 0.6.0 so no bump needed)
  and created annotated tag `cms-v0.6.0`.
- **Verified:** `git tag -l 'cms-v*'` now shows `cms-v0.6.0`; `git tag -v`/`show`
  confirms it's annotated and points at this run's commit; `release-notes/0.6.0.md`
  exists. Did NOT push (Meeseeks rule: one local commit per run, no push) — the tag is
  local; a future run / the user pushes it. SKILL is markdown-only; no app code to gate.
- **Files:** `.claude/skills/cms-release/SKILL.md`, `release-notes/0.6.0.md`, tag
  `cms-v0.6.0` (local), goal memory.

## 2026-06-22 12:26 — Slice 2: deployer GET /tags + GET /release-notes
- **Status:** DONE
- **What I did:** Added two GET endpoints to `deployer/src/index.ts` (auth: existing
  Bearer `DEPLOYER_SECRET`, same as /deploy):
  - `GET /tags` → `sandbox.exec('git ls-remote --tags "$REPO_URL"')` (no clone),
    filters lines to `cms-v<x.y.z>` (`CMS_TAG_RE`), dedupes the `^{}` peeled refs,
    returns `{tags:[{version,tag}]}` sorted newest-first (`cmpSemver`).
  - `GET /release-notes?version=x.y.z` → validates bare semver, shallow `git clone
    --depth 1 --branch cms-v<ver>` into `/workspace/notes-<ver>`, `cat`s
    `release-notes/<ver>.md`, returns `{version, markdown}`. 404 (`notesNotFound`)
    when the file is absent at that tag, 400 on bad version.
  - Git auth reuses the SAME http.extraHeader/$GITHUB_TOKEN trick as buildScript()
    via a shared `gitAuthEnv()` (token never in argv/URL). `$REPO_URL`/`$VER` passed
    through `exec({env})`, never interpolated into the shell → no injection surface.
- **Verified:** `npx wrangler deploy --dry-run --outdir=/tmp/...` bundles clean
  (esbuild would fail on type/syntax errors) — the worker builds with the new code.
  Dockerfile confirms `git` is in the container. Could NOT do a live end-to-end
  call against the real remote: `cms-v0.6.0` is LOCAL only (not pushed), so a real
  `git ls-remote` won't list it yet — that verification waits on the tag being
  pushed (see CAVEATS). No tsc in deployer (TS not installed); dry-run is the gate.
- **Files:** `deployer/src/index.ts`, goal memory.

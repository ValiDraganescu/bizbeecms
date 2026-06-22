# Note to the next Meeseeks (cms-releases)

Slice 1 is DONE. The release tooling foundation EXISTS:
- `.claude/skills/cms-release/SKILL.md` — `commit` (→ /orc-commit) + `release`
  (draft notes → human edit → bump → annotated `cms-v<x.y.z>` tag → push).
- First tag cut: **`cms-v0.6.0`** (annotated) + `release-notes/0.6.0.md`.
  CMS was already 0.6.0 so the baseline didn't bump; future releases DO bump.

⚠️ The tag is LOCAL only — Meeseeks don't push. Slice 2's deployer `GET /tags`
reads the REMOTE (`git ls-remote --tags $REPO_URL`), so it won't see `cms-v0.6.0`
until someone pushes it. **Push `cms-v0.6.0` + the release-notes commit before
verifying Slice 2 against the real deployer** (or ask the user to push).

PICK NEXT: **Slice 2 — deployer: list tags + serve release notes.** In
`deployer/src/index.ts` (auth: existing deployer bearer):
- `GET /tags` → `git ls-remote --tags $REPO_URL`, filter `cms-v*`, return sorted
  newest-first `[{version, tag}]`. Use `ls-remote` (no clone).
- `GET /release-notes?version=x.y.z` → `git show cms-v<ver>:release-notes/<ver>.md`
  (or GitHub raw at the tag) → return the markdown.
Reuse `REPO_URL`/`GITHUB_TOKEN` secrets. Gate: deployer builds/deploys clean.

After Slice 2: Slice 3 (record version end-to-end on `sites`), Slice 4 (show in
list+detail — the user's original ask), Slice 5 (PM picker + notes viewer).

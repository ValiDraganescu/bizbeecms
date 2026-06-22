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

- **The release skill EXISTS now: `.claude/skills/cms-release/SKILL.md`** (`commit` +
  `release`). The first tag `cms-v0.6.0` + `release-notes/0.6.0.md` exist. CMS was
  already 0.6.0 so the baseline tag did NOT bump the version — future `release` runs DO
  bump CMS/package.json before tagging.

- **Meeseeks don't push** (skill rule: one LOCAL commit per run, no push). So the
  `cms-v0.6.0` tag is LOCAL only this run. Slice 2 (deployer `GET /tags` via
  `git ls-remote --tags $REPO_URL`) will NOT see it until the tag is pushed to origin.
  Push `cms-v0.6.0` (and the release-notes commit) before verifying Slice 2 against the
  real remote — or have the user push. The deployer reads the REMOTE.

- **Verify a tag is annotated** with `git cat-file -t cms-v<ver>` → must be `tag` (not
  `commit`). Use `git tag -a ... -m ...`, never a lightweight `git tag <name>`.

- **Deployer has NO tsc** (TypeScript isn't a dep; `npx tsc` errors out). Gate the
  deployer with `npx wrangler deploy --dry-run --outdir=/tmp/x` — it runs esbuild and
  FAILS on type/syntax errors, so it's a real typecheck-ish gate without uploading.
  (It does build the Sandbox Docker image first — slow first run, cached after.)

- **Deployer GET /tags + /release-notes EXIST now** (Slice 2,
  `deployer/src/index.ts`). Both auth with the existing Bearer `DEPLOYER_SECRET`.
  `/tags` uses `sandbox.exec('git ls-remote --tags "$REPO_URL"')` (no clone);
  `/release-notes?version=` shallow-clones the one tag + cats the notes. Git auth
  goes through the shared `gitAuthEnv()` (http.extraHeader + $GITHUB_TOKEN, same as
  the deploy clone). When wiring PM (Slice 5), call these with `Bearer
  DEPLOYER_SECRET`; `/tags` returns `{tags:[{version,tag}]}`, `/release-notes`
  returns `{version, markdown}`.

- **`/tags` reads the REMOTE — won't list `cms-v0.6.0` until it's PUSHED.** The tag
  is still local-only (Meeseeks don't push). End-to-end verifying Slice 2 against the
  real deployer requires the user (or a non-Meeseeks run) to push `cms-v0.6.0` first.

- **Slice 3 is DONE — version is recorded end-to-end now.** Deployer success
  callback sends `deployedRef:"$REF"`; `sites.deployedCmsVersion` (text, migration
  `0009_deployed_cms_version.sql`) stores it. The parse/validate/display logic is the
  PURE helper `ProjectManager/src/lib/deploy/cms-version.ts` —
  `displayCmsVersion(stored)` turns `cms-v0.6.0`→`0.6.0` (else verbatim, e.g.
  `main`). USE IT in Slice 4's list/detail UI; don't re-parse.
- **`setSiteDeployStatus` now takes an optional 4th arg `deployedCmsVersion`** —
  `undefined` leaves the column UNTOUCHED (so a `failed`/`deploying` transition keeps
  the last good version). Only `status==="deployed"` callbacks set it.
- **The deploy route reads an optional `ref` from the POST body** (validated
  `^[\w.\-/]+$`, forwarded to the deployer). Slice 5's picker just POSTs
  `{ref:"cms-v<ver>"}` — the route + deployer + callback already carry it through.
  No body → deployer defaults to `main`, callback records `main`.
- **Run `drizzle-kit generate`, don't hand-write migrations** — it updates
  `migrations/meta/_journal.json` + the snapshot too. `npm test` is 122 now (Slice 3
  added 7). Gates: PM `tsc` + `opennextjs-cloudflare build`; deployer `wrangler deploy
  --dry-run`. Build only when no `npm run dev` is on 3601 (it corrupts `.next`).

- **Slice 5 DONE — the PICKER is wired.** PM proxy routes
  `ProjectManager/src/app/api/cms-releases/tags/route.ts` (→ deployer `/tags`) and
  `.../release-notes/route.ts` (→ deployer `/release-notes?version=`) are
  session-authed and add the `Bearer DEPLOYER_SECRET` server-side — the client NEVER
  sees the secret; it fetches PM's own routes. `/tags` returns `{releases:[{version,
  tag}]}` (normalized by the pure `lib/deploy/cms-releases.ts`); `/release-notes`
  returns `{version, markdown}`. Reuse these for Slice 6, don't re-proxy.
- **`normalizeReleases` (lib/deploy/cms-releases.ts) is the trust boundary for the
  tag list** — it semver-sorts newest-first and drops non-`cms-v` / non-semver / dupe
  entries. The deployer already sorts, but PM re-sorts defensively. `refForVersion(v)`
  builds the `cms-v<v>` ref the deploy POST sends.
- **The picker is EMPTY until `cms-v0.6.0` (and future tags) are PUSHED to origin** —
  `/tags` reads the REMOTE via the deployer. With no tags, deploy-form disables the
  Deploy button and shows `version.none`. This is correct, not a bug; ask the user to
  push the tag to see it populate.
- **Release-notes modal renders RAW markdown in a `<pre>`** (no md lib — ponytail).
  If rich rendering is ever wanted, add react-markdown in `ReleaseNotesModal` in
  deploy-form.tsx; the route already serves the markdown string.

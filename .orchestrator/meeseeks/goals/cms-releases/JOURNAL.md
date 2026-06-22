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

## 2026-06-22 13:12 — Slice 3: record deployed CMS version end-to-end
- **Status:** DONE
- **What I did:** Threaded the deployed CMS ref from deployer → callback → `sites`:
  - **Schema + migration:** added `deployedCmsVersion` (text, nullable) to `sites`
    (`ProjectManager/src/db/schema.ts`); `drizzle-kit generate` →
    `migrations/0009_deployed_cms_version.sql` (`ALTER TABLE sites ADD ...`) +
    `meta/` snapshot.
  - **Deployer success callback** (`deployer/src/index.ts`, `buildScript()` ~465):
    added `"deployedRef":"$REF"` to the `deployed` JSON body. `$REF` was already in
    the script env — no clone/build change.
  - **Pure helper** `ProjectManager/src/lib/deploy/cms-version.ts`:
    `parseCmsTag` (cms-v<x.y.z>→x.y.z), `deployedVersionFromCallback` (validate the
    ref against `^[\w.\-/]+$`, cap 80, null on absent/junk), `displayCmsVersion`
    (tag→x.y.z, else verbatim) — node-testable, no CF/db deps.
  - **Callback ingest** (`api/deploy-callback/route.ts`): added `deployedRef` to
    `Body`; on `status==="deployed"` derives the version via the helper and passes it
    to `setSiteDeployStatus`. On `failed`/`deploying` it stays `undefined` → column
    untouched (last good version survives).
  - **`setSiteDeployStatus`** (`lib/site/site.ts`): new optional 4th arg
    `deployedCmsVersion`; `undefined` leaves the column alone, a value sets it.
  - **Deploy route** (`api/sites/[id]/deploy/route.ts`): now reads an optional `ref`
    from the POST body (validated), forwards it to the deployer when present (Slice 5's
    picker will send `cms-v<ver>`); absent body → deployer defaults to `main` (the
    documented Slice-3 default — records whatever was deployed). Client deploy-form
    sends no body today; route's try/catch tolerates that — NO client change.
- **Verified:** `cms-version.test.ts` (7 cases: tag parse, callback record/reject
  shell-unsafe/length-cap, display) pass; full PM suite 122 pass (was 115). `tsc
  --noEmit` 0 errors. `opennextjs-cloudflare build` green. Deployer `wrangler deploy
  --dry-run` bundles clean. Could NOT live-verify an actual deploy callback writing the
  column (needs a real deploy + DB).
- **Files:** `ProjectManager/src/db/schema.ts`,
  `ProjectManager/migrations/0009_deployed_cms_version.sql` (+ `meta/`),
  `ProjectManager/src/lib/deploy/cms-version.ts` (+`.test.ts`),
  `ProjectManager/src/app/api/deploy-callback/route.ts`,
  `ProjectManager/src/lib/site/site.ts`,
  `ProjectManager/src/app/api/sites/[id]/deploy/route.ts`,
  `deployer/src/index.ts`, goal memory.

## 2026-06-22 13:17 — Slice 4: show deployed CMS version in site list + detail
- **Status:** DONE
- **What I did:** Rendered `displayCmsVersion(site.deployedCmsVersion)` in PM site
  LIST (`app/(app)/sites/page.tsx` — new column between Status and Open) and DETAIL
  (`sites/[id]/page.tsx` — new `Detail` in the overview grid before "Created by").
  `cms-v0.6.0`→`0.6.0`, `main` verbatim; null → muted localized "Not deployed".
  Reused the pure Slice-3 helper `lib/deploy/cms-version.ts` (no re-parse). Added
  `list.cmsVersion`/`list.cmsVersionNone` + `detail.cmsVersion`/`detail.cmsVersionNone`
  to EN/FI/ET. The user's ORIGINAL ask ("show the CMS version") now lands.
- **Verified:** `tsc --noEmit` clean; `npm test` 122/122; `opennextjs-cloudflare
  build` green (no dev on 3601). Display-only over an already-tested pure helper, so
  no new test added. NOT live-verified in a browser (no deploy this run).
- **Files:** ProjectManager/src/app/(app)/sites/page.tsx,
  ProjectManager/src/app/(app)/sites/[id]/page.tsx,
  ProjectManager/messages/{en,fi,et}.json

## 2026-06-22 13:22 — Slice 5: PM CMS version picker + release-notes viewer
- **Status:** DONE
- **What I did:** Wired the deploy flow to TAGGED RELEASES ONLY.
  - Two PM proxy routes (session-authed; DEPLOYER_SECRET stays server-side):
    `GET /api/cms-releases/tags` → deployer `/tags` with Bearer DEPLOYER_SECRET →
    `{releases:[{version,tag}]}` via `normalizeReleases`; `GET /api/cms-releases/
    release-notes?version=x.y.z` → deployer `/release-notes` → `{version,markdown}`
    (validates bare semver, maps 404→notesNotFound).
  - Pure helper `lib/deploy/cms-releases.ts` — `normalizeReleases(payload)` filters
    to valid `cms-v<x.y.z>` releases, de-dupes, semver-sorts newest-first (defends
    against malformed deployer output); `refForVersion(v)→cms-v<v>`. 5 node tests.
  - `deploy-form.tsx`: version `<select>` (loaded once from /tags, defaults to
    latest), "view release notes" → in-app modal (`role=dialog`, Escape-to-close,
    backdrop click; raw markdown in `<pre>` — no md lib). Deploy POSTs
    `{ref:"cms-v<ver>"}` (route already forwards ref). Deploy disabled when no
    releases. EN/FI/ET `sites.deploy.version.*` block.
- **Verified:** `npm test` 127 (was 122, +5); `npx tsc --noEmit` clean; `npx
  opennextjs-cloudflare build` green (port 3601 free). NOT live-verified: /tags reads
  the REMOTE and `cms-v0.6.0` is still LOCAL-only — picker will be empty until the
  user pushes the tag. Scope: ProjectManager/src/ only (deployer untouched).
- **Files:** ProjectManager/src/lib/deploy/cms-releases.ts(+test),
  src/app/api/cms-releases/{tags,release-notes}/route.ts,
  src/app/(app)/sites/deploy-form.tsx, messages/{en,fi,et}.json

# Note to the next Meeseeks (cms-releases)

Slices 1 & 2 are DONE.
- **Slice 1:** release skill `.claude/skills/cms-release/SKILL.md` + first tag
  `cms-v0.6.0` (LOCAL) + `release-notes/0.6.0.md`.
- **Slice 2:** deployer endpoints in `deployer/src/index.ts`:
  - `GET /tags` (Bearer DEPLOYER_SECRET) → `{tags:[{version,tag}]}` newest-first,
    via `git ls-remote --tags "$REPO_URL"` (no clone), filtered to `cms-v<x.y.z>`.
  - `GET /release-notes?version=x.y.z` (Bearer DEPLOYER_SECRET) → `{version,markdown}`
    via shallow clone of the one tag + cat. 404 notesNotFound / 400 badRequest.
  - Gate used: `npx wrangler deploy --dry-run` (deployer has NO tsc).

⚠️ `cms-v0.6.0` is LOCAL only — `/tags` reads the REMOTE so it stays empty until the
tag is pushed. Ask the user to push `cms-v0.6.0` + the release-notes commit before
verifying Slice 2 (or Slice 5's picker) against the live deployer.

PICK NEXT: **Slice 3 — PM: record deployed CMS version end-to-end.** All in
`ProjectManager/` + the deployer SUCCESS callback:
- Add `deployedCmsVersion` (text, nullable) to `sites` in
  `ProjectManager/src/db/schema.ts` + a Drizzle migration.
- Thread the chosen version: PM deploy route sends `ref = cms-v<ver>` to the deployer;
  the deployer success callback (`report deployed` body in `buildScript()`, ~324)
  must include the version; PM callback ingest (`api/deploy-callback/route.ts` Body +
  `setSiteDeployStatus`) stores it on the site. Default to recording whatever ref was
  deployed if the picker UI (Slice 5) isn't wired yet.
- Node tests for the callback storing the version. Gate PM (tsc/build).

Then Slice 4 (show version in list+detail — the user's ORIGINAL ask) and Slice 5
(PM picker + notes viewer calling the Slice-2 endpoints).

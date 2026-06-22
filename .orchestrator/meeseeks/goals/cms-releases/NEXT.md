# Note to the next Meeseeks (cms-releases)

Slices 1, 2 & 3 are DONE.
- **Slice 1:** release skill `.claude/skills/cms-release/SKILL.md` + tag `cms-v0.6.0`
  (LOCAL only) + `release-notes/0.6.0.md`.
- **Slice 2:** deployer `GET /tags` + `GET /release-notes?version=` (Bearer
  DEPLOYER_SECRET) in `deployer/src/index.ts`.
- **Slice 3:** deployed CMS version recorded end-to-end. `sites.deployedCmsVersion`
  (migration `0009_deployed_cms_version.sql`); deployer success callback echoes
  `deployedRef:"$REF"`; callback ingest stores it via `setSiteDeployStatus(... ,
  version)`; deploy route forwards an optional `ref` from its POST body. Pure helper
  `ProjectManager/src/lib/deploy/cms-version.ts` (`displayCmsVersion` etc.) + 7 tests.

⚠️ `cms-v0.6.0` is still LOCAL — `/tags` reads the REMOTE so it's empty until pushed.
Ask the user to push `cms-v0.6.0` + the release-notes commit before live-verifying
Slice 2 or Slice 5's picker against the real deployer.

PICK NEXT: **Slice 4 — show the deployed CMS version in the site LIST + DETAIL** (the
user's ORIGINAL ask, now fully unblocked since Slice 3 records the value):
- List: `ProjectManager/src/app/(app)/sites/page.tsx` (~line 106, next to the status
  badge) — render `displayCmsVersion(site.deployedCmsVersion)`; null → muted "—" /
  "not deployed".
- Detail: `sites/[id]/page.tsx` (the detail grid ~109, near `workerName`).
- USE the pure `displayCmsVersion` from `lib/deploy/cms-version.ts` — don't re-parse.
- EN/FI/ET for the new label string. No native confirm/alert. Gate PM (tsc + opennext;
  build only with no dev on 3601).

Then Slice 5 (PM version PICKER + release-notes viewer calling the Slice-2 deployer
endpoints; POST `{ref:"cms-v<ver>"}` to the deploy route — the route already forwards
it). NOTE the parallel-safety: another worker may be in CMS/src/** — stay in
ProjectManager/ + deployer/.

# Note to the next Meeseeks (cms-releases)

Slices 1, 2, 3, 4 & 5 are DONE — the full loop is wired end-to-end.
- **Slice 1:** release skill `.claude/skills/cms-release/SKILL.md` + tag `cms-v0.6.0`
  (LOCAL only) + `release-notes/0.6.0.md`.
- **Slice 2:** deployer `GET /tags` + `GET /release-notes?version=` (Bearer
  DEPLOYER_SECRET) in `deployer/src/index.ts`.
- **Slice 3:** deployed version recorded end-to-end (`sites.deployedCmsVersion`,
  callback echoes `deployedRef`, pure helper `lib/deploy/cms-version.ts`).
- **Slice 4:** PM site LIST + DETAIL show `displayCmsVersion(...)`.
- **Slice 5 (this run):** PM CMS version PICKER + release-notes viewer on the deploy
  form. PM proxy routes `/api/cms-releases/{tags,release-notes}` (secret stays
  server-side), pure `lib/deploy/cms-releases.ts` (`normalizeReleases`/`refForVersion`,
  +5 node tests), `deploy-form.tsx` `<select>` (default latest) + in-app notes modal,
  deploy POSTs `{ref:"cms-v<ver>"}`. tsc 0, 127 tests, opennext build green.

⚠️ **The picker is EMPTY until `cms-v0.6.0` is PUSHED** — `/tags` reads the REMOTE.
Meeseeks don't push, so ask the user to push `cms-v0.6.0` + the release-notes commit,
then live-verify: deploy a Site → picker shows 0.6.0 → notes modal renders
`release-notes/0.6.0.md` → deploy → Slice 4 shows the version on list/detail.

PICK NEXT: **Slice 6 (optional) — "update available" indicator** in the site list.
Compare each site's `deployedCmsVersion` to the latest `cms-v*` tag (the same
`/api/cms-releases/tags` route already returns them newest-first → `releases[0]`).
Flag sites where deployed < latest with a small "update available" badge. Pure
semver-compare helper (reuse/extend `lib/deploy/cms-releases.ts`) + a node test +
the list UI + EN/FI/ET. Server-side: the list page can fetch the deployer tags once
(or read latest from a cached source) — don't N+1 per row.

PARALLEL-SAFETY: another worker may be in CMS/src/** — STAY in ProjectManager/ +
deployer/; do not run bundle:cms.

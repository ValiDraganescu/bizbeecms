# Note to the next Meeseeks (cms-releases)

Slices 1–6 are ALL DONE — the full CMS release + versioned-deploy loop is built.
- **1:** release skill `.claude/skills/cms-release/SKILL.md` + tag `cms-v0.6.0`
  (LOCAL) + `release-notes/0.6.0.md`.
- **2:** deployer `GET /tags` + `GET /release-notes?version=` (Bearer DEPLOYER_SECRET).
- **3:** deployed version recorded end-to-end (`sites.deployedCmsVersion`, callback
  echoes `deployedRef`, pure `lib/deploy/cms-version.ts`).
- **4:** PM site LIST + DETAIL show `displayCmsVersion(...)`.
- **5:** PM version PICKER + release-notes modal on the deploy form (proxy routes
  `/api/cms-releases/{tags,release-notes}`, pure `lib/deploy/cms-releases.ts`).
- **6 (this run):** "update available" badge in the site list. Pure
  `isUpdateAvailable` + server-only `fetchCmsReleases()` (single `/tags` fetch, no
  N+1) + `<Badge tone="warning" dot>` `list.cmsUpdateAvailable` (EN/FI/ET).
  130 tests, tsc 0, opennext build green.

⚠️ **Everything below is LIVE-VERIFY, not codeable by a Meeseeks (we don't push):**
The whole feature is invisible until `cms-v0.6.0` (+ the release-notes commit) is
PUSHED to origin — `/tags` reads the REMOTE. ASK THE USER to push, then live-verify:
1. Site detail deploy form → picker lists `0.6.0`, notes modal renders
   `release-notes/0.6.0.md`, deploy `cms-v0.6.0`.
2. Site list/detail show `0.6.0` (Slice 4).
3. After cutting a NEWER tag (e.g. `cms-v0.7.0`) and deploying a site from the older
   one, the site list shows the "Update available" badge (Slice 6).

PICK NEXT (no codeable slices left in scope) — the goal's "what good looks like" is
met. If the user wants more, all OPTIONAL:
- Surface "update available" on the site DETAIL page too (currently list-only).
- A "deploy latest" shortcut from the badge (one-click upgrade).
- Rich markdown in the release-notes modal (add react-markdown in deploy-form.tsx).
Otherwise this goal can be archived once the user confirms the live end-to-end run.

PARALLEL-SAFETY: stay in ProjectManager/ + deployer/; do NOT touch CMS/src/** or run
bundle:cms (another worker owns that).

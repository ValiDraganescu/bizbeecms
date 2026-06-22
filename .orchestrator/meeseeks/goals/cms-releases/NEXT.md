# Note to the next Meeseeks (cms-releases)

Slices 1, 2, 3 & 4 are DONE.
- **Slice 1:** release skill `.claude/skills/cms-release/SKILL.md` + tag `cms-v0.6.0`
  (LOCAL only) + `release-notes/0.6.0.md`.
- **Slice 2:** deployer `GET /tags` + `GET /release-notes?version=` (Bearer
  DEPLOYER_SECRET) in `deployer/src/index.ts`.
- **Slice 3:** deployed CMS version recorded end-to-end (`sites.deployedCmsVersion`,
  callback echoes `deployedRef`, pure helper `lib/deploy/cms-version.ts`).
- **Slice 4 (this run):** PM site LIST + DETAIL now show
  `displayCmsVersion(site.deployedCmsVersion)`; null → muted "Not deployed".
  New i18n keys `sites.list.cmsVersion`/`cmsVersionNone` +
  `sites.detail.cmsVersion`/`cmsVersionNone` (EN/FI/ET). tsc 0, 122 tests, opennext
  build green.

⚠️ `cms-v0.6.0` is still LOCAL — `/tags` reads the REMOTE so it's empty until pushed.
Ask the user to push `cms-v0.6.0` + the release-notes commit before live-verifying
Slice 2 or Slice 5's picker against the real deployer.

PICK NEXT: **Slice 5 — PM CMS version PICKER + release-notes viewer** on the deploy
flow (the deploy button/dialog in `sites/[id]/page.tsx` → `deploy-form.tsx`):
- A version `<select>` populated from the deployer `GET /tags` (Slice 2) — TAGGED
  RELEASES ONLY (no `main` option), default latest. Add a PM API route that proxies
  the deployer `/tags` with `Bearer DEPLOYER_SECRET` (don't expose the secret to the
  client; PM client fetches PM's own route).
- A "view release notes" action → PM route proxying `GET /release-notes?version=` →
  render markdown in an IN-APP modal/panel (NO native dialog).
- Deploy POSTs `{ref:"cms-v<ver>"}` to the deploy route — the route ALREADY forwards
  `ref` to the deployer (Slice 3). So picker → ref → deployer → callback records it →
  Slice 4 shows it. Full loop closes.
- Reuse design-system + purpose tokens. EN/FI/ET for picker + "view release notes" +
  any empty/loading strings. Gate PM (tsc + opennext; build only with no dev on 3601).

PARALLEL-SAFETY: another worker may be in CMS/src/** — STAY in ProjectManager/ +
deployer/; do not run bundle:cms.

Then Slice 6 (optional) — "update available" indicator in the list (compare
`deployedCmsVersion` to latest `cms-v*` tag).

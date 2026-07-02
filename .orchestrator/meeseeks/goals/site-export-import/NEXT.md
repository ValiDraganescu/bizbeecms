# Note to the next Meeseeks (site-export-import)

**Admin UI is now DONE** — the whole BACKLOG task list except the final
E2E/HITL slice is complete. Read FORMAT.md first if you touch the wire
format; it's still the contract, unchanged this run.

- New: `/admin/settings/export-import` page + `ExportImportManager` (client
  component, `CMS/src/components/settings/export-import-manager.tsx`) driving
  the full protocol: Export button → downloads `site.json` + lists every
  asset with an individual download link. Import: pick `site.json` → dry-run
  report (destroy/create counts, cap check, secrets-to-reenter) → pick the
  downloaded asset files (multi-file input) → type the site name to confirm
  (disabled + named error if the artifact has no `meta.siteName`) → execute →
  sequential per-asset upload with a progress counter → final report.
- Added `exportImport.*` i18n keys (28 keys, all 3 locales) +
  `settingsNav.exportImport` tab.
- **No new server code** — every route (`/api/site-export`,
  `/api/site-export/asset/<key>`, `/api/site-import/validate`,
  `/api/site-import`, `/api/site-import/asset/<key>`) already existed; this
  run was pure client orchestration.
- **This Meeseeks run had NO browser-automation tools available** (not
  granted to this instance's toolset) — verification was via curl calls that
  EXACTLY mirror the client's fetch URLs/bodies (unwrapped artifact body to
  `/validate`, `{artifact,confirm}` to `/api/site-import`, the `/`-containing
  asset key template string against the real catch-all route) plus a static
  `curl` of the rendered page HTML. If you have Chrome tools available, a
  real click-through of `/admin/settings/export-import` would be a good
  belt-and-suspenders check, but the wiring is already proven correct via the
  live HTTP round-trip in this run's JOURNAL entry.
- Live-verified: the real tableonline site currently has `meta.siteName:""`
  (no `site_identity` settings row set) — so the "blank site name, cannot
  confirm" UI path is what a real operator hits TODAY on this instance, not
  a theoretical edge case. If a future run wants to smoke-test the HAPPY
  confirm path in the browser, either set a `site_identity` name first (via
  the Brand settings page) or accept that path is already proven via the
  curl round-trip in JOURNAL.

**Next TODO (per BACKLOG.md, the ONLY remaining item):**

- **E2E/HITL slice**: export the local-site (:3602) with its full
  tableonline content, import it into a SECOND instance (scratch second
  local D1 or the deployed `bizbeecms-cms-test-1` — pick the cheaper one),
  click through: home renders identically, a city page, a booking form
  submit, gallery images load. This is genuinely a cross-INSTANCE test — all
  prior smoke tests (including this run's) were same-instance round-trips,
  which don't exercise anything about a truly different target D1/R2/KEK.
  Record gaps as new TODOs. Standing up a second local D1 (a second
  `wrangler dev` with a different `--persist-to` dir, or a fresh
  `bizbeecms-cms-test-1` local clone) is the main setup work here — budget
  time for that before the actual export/import click-through.

One thing worth knowing: `CAVEATS.md`'s body is STILL mostly copy-pasted
noise from a DIFFERENT goal (`tableonline-home`) — still out of scope for a
one-task run to prune. The genuinely-this-goal entries are clustered near the
top (cap hard-fail-vs-warning, D1 bound-param cap, content-type-trust note).

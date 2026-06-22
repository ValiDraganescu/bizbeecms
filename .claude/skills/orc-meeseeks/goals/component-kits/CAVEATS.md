# Caveats — component-kits
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **The export/import machinery ALREADY EXISTS — extend, don't rebuild.** Verified
  2026-06-22: `lib/components/portable.ts` (`PortableComponent` envelope +
  `parsePortableComponent` trust boundary), `api/components` (export-one/import-one),
  `api/components/kit` (multi-component install with `sourceKit`), the 5 premade
  kits, `component-store.ts` CRUD. This goal ADDS tags + an export-by-tag bundle on
  top. Do NOT fork a second serialization or trust path.

- **Reuse the trust boundary on import.** Imported component artifacts are
  untrusted — they MUST go through `parsePortableComponent` / `validateComponentArtifact`
  (same gate as the AI write path). A kit bundle import re-validates EACH component;
  never bypass it for a "trusted kit".

- **NOT the PM/Site tagging.** The `pm-roles` subgoal adds dynamic tags to SITES for
  access scope. THIS goal's tags are on COMPONENTS inside one CMS for kit-building —
  a totally separate concern, separate schema (the CMS D1 `component` table), no
  cross-reference. Don't conflate them.

- **Keep tags simple (ponytail).** USER asked for component tagging + export-by-tag,
  not a tag-governance system. A `tags` column on `component` (JSON string array)
  plus autocomplete from the existing distinct tags is likely enough; only add a
  managed tag table if a real need shows up. Mark the choice with a `// ponytail:`
  comment.

- **Tags must round-trip.** Put tags in the portable envelope so export→import
  preserves them. The kit bundle is a NEW envelope `format:"bizbeecms.kit"` wrapping
  `components: PortableComponent[]` — version it (`version:1`) and validate the
  format/version on import like the component envelope does.

- **Nested deps come along.** Per-component export already collects asset deps +
  referenced child components. The kit export must include each component's deps so
  the kit installs cleanly elsewhere — reuse the existing dep-collection, don't
  hand-roll a partial one.

- **Each CMS Worker has its OWN D1.** The `tags` column change is a Drizzle
  migration; the deployer applies CMS migrations per-Site (confirm the migration
  path; note if it doesn't auto-apply).

- **Gate every slice:** CMS `tsc` + `npx opennextjs-cloudflare build` green (NEVER
  while `npm run dev` is up). Regen the PM `cms-bundle`. EN/FI/ET for new strings.

- **No native confirm()/alert()** in any UI (browser-review sessions hang) — use an
  in-app modal for any destructive tag action.

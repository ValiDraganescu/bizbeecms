# Caveats — component-kits
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **`git commit` includes ALREADY-STAGED changes you didn't add.** Slice 8: the
  curator had pre-staged a batch of `R ` (rename→archive) entries in the index
  before this run. `git add -- <my paths>` only adds MY paths, but `git commit`
  (no pathspec) commits the WHOLE index — so those curator renames rode along in my
  commit. Harmless here (they were a completed curator action, not live edits), but
  if you must keep your commit surgically clean, either `git commit -- <your paths>`
  (commit only those pathspecs) or check `git status --short` for pre-staged `R`/`A`/`M`
  rows in the FIRST column before committing. Never `git reset`/unstage another
  worker's staged work to "clean up" — just commit your paths explicitly.

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

- **`@/` alias does NOT resolve under `node --test`.** A RUNTIME `import {x} from "@/..."`
  in code reached by a `.test.mjs`/`.test.ts` throws `ERR_MODULE_NOT_FOUND`. Type-only
  `import type` is fine (erased). For runtime imports in pure/tested modules, use a
  relative `.ts` path (e.g. `../lib/components/tags.ts`). Slice 1 hit this in
  `component-store.ts` importing `serializeTags`.

- **DDL is duplicated in `scripts/component-store.test.mjs`.** That test hand-writes
  the `component` CREATE TABLE (it doesn't run the migrations). Any new column on
  `component` (Slice 1 added `tags`) MUST also be added to that test's `COMPONENT_DDL`
  or every upsert test fails with `table component has no column named <col>`.

- **Tags persistence is split by write path (by design):** the IMPORT path
  (`upsertImportedComponent`) writes `serializeTags(c.tags)`; the AI write path
  (`upsertComponent`) does NOT touch tags (preserves existing on update, DB default
  `[]` on insert). Slice 2's tags-edit PATCH must use a tags-only update — never
  re-route through `upsertComponent` (which would clobber the artifact's tags column
  isn't its job) — add a dedicated tiny update or extend `upsertComponent` carefully.

- **Migrations auto-apply per-Site.** The deployer runs `wrangler d1 migrations apply
  DB --remote` inside the container during each deploy (deployer/src/index.ts:498), so
  a new Drizzle migration (committed to `CMS/migrations/`) lands on every Site's D1 on
  the next deploy. No manual apply needed. Existing Sites get it on their next deploy.

- **PRE-EXISTING unrelated test failure:** `scripts/ports-sole-reader.guard.test.mjs`
  ("no env.DB/MEDIA/AI binding read outside CMS/src/lib/ports") fails on `content-db.ts`
  (commit ce01b0d, content-collections goal) — NOT this goal. `npm test` = 499/500.
  Don't chase it here.

- **A parallel pm-roles worker leaves PM files dirty in the shared tree.** Slice 2
  saw uncommitted `ProjectManager/{migrations/0007_tags.sql,migrations/meta/*,src/db/schema.ts,
  src/lib/site/scope.ts,scope.test.ts}` that are NOT this goal's. Stage ONLY your own
  paths — your single PM file is `src/lib/deploy/cms-bundle.generated.js`. NEVER `git add -A`.

- **next-intl `t()` is strict on object args.** Passing `{ name: maybeUndefined }`
  where the type is `string | undefined` fails `tsc` (`Type 'undefined' not assignable
  to string|number|Date`). Use a `?? ""` (or `?? 0`) fallback. Slice 4 hit this after
  widening the import-response type to add the optional kit fields.

- **A parallel CMS CHAT worker leaves `CMS/src/lib/chat/**` + `CMS/src/app/api/chat/**`
  dirty.** Slice 4 saw uncommitted `lib/chat/models.ts`, `api/chat/models/route.ts`,
  `scripts/models.test.mjs` that are NOT this goal. STAY OUT of chat; stage ONLY your
  own component-kit paths. NEVER `git add -A`.

- **`ComponentGroup.kit` is overloaded by design (Slice 5).** The rail's grouping fns
  (`groupComponentsByKit`, `groupComponentsByTag`) BOTH return `ComponentGroup`; in tag
  mode the `kit` field carries the TAG (null = untagged), not a kit id. This lets
  `filterGroups` + the rail render path stay single-pathed. The rail's `groupLabel`
  branches on `groupBy` to interpret it. Don't "fix" the field name — keep the shared shape.

- **The page-builder rail's broken-image impeccable finding is a FALSE POSITIVE.** It's a
  doc-comment in `MetaImagePicker` ("native <img>") — no actual tag. Every edit to
  `page-builder-shell.tsx` re-triggers it at a shifted line. Ignore it; it's not your code.

- **A new column on `component` ripples to all 5 premade kits.** Their `bundle()`
  wrappers build a `PortableComponent` literal; a new REQUIRED envelope field (Slice 1's
  `tags`) breaks `tsc` in blog/docs/landing/pricing/portfolio-kit.ts until each sets it.
  Make new envelope fields optional, or update all 5 + the kit route.

# Note to the next Meeseeks (component-kits)

ALL slices DONE (1-9). Core goal fully delivered AND polished: tag components →
export by tag as a kit (now with an optional NAME + DESCRIPTION) → preview a kit
(shows name, description, per-component create/update, tags, missing deps) before
install → import the kit → SEE a per-component install result → rail grouping by
tag. No open TODO, no bugs.

Slice 9 (this run): kit metadata on export. The `bizbeecms.kit` envelope already
had `name` + `meta.note`; this run wired them end-to-end — `buildKitBundle(rows,
tag, {name?,note?})` (name overrides the tag, note → meta.note, both trimmed),
`GET /api/components/export?...&name=&note=` (bounded 120/2000), `parseKitBundle`
reads+bounds the untrusted note, `summarizeKitBundle`/`KitPreview` surface it, and
the UI got name/description inputs (shown under the tag filter when a tag is
selected) + a note line in the preview panel. 3 i18n keys EN/FI/ET. +3 node tests
(20/20). tsc + opennext gate green; cms-bundle regenerated.

PICK NEXT — backlog empty, so INVENT the next worthwhile slice toward GOAL.md
ONLY IF it clearly helps an operator. The CORE directive (tag → export-by-tag →
import) plus preview/result/grouping/metadata is fully satisfied; remaining ideas
are diminishing-returns polish — judge value HARD before doing one:
- **Bulk tag editing** — select N components, add/remove a tag across all at once.
  Useful when assembling a kit from many existing components. Highest residual value.
- **Multi-tag filter/export (AND/OR)** — only if operators accumulate many tags.
- **A "kits" overview** — list distinct tags with component counts + one-click
  export per tag (vs the current select-then-export). Minor convenience.
If none reads as genuinely valuable, the goal is effectively COMPLETE — say so and
do a small hardening/test-coverage slice rather than inventing busywork.

WATCH OUT:
- NEW: the opennext gate can fail on a STALE `next build` lock (trace points at
  page-builder-shell:1146 — RED HERRING). See CAVEATS top entry. Don't run a
  standalone `next build` to "debug"; it leaves the lock. pkill + rm -rf .next.
- STAY OUT of other workers' files in the shared tree. STAGE ONLY YOUR OWN PATHS.
  Your only PM file is `ProjectManager/src/lib/deploy/cms-bundle.generated.js`.
  NEVER `git add -A`. (Memory says "commit all = git add -A" but that's the USER's
  rule for their own work — here, with parallel workers, stage your paths only.)
- `npm run bundle:cms` (from ProjectManager/) IS the opennext gate AND regens the
  PM bundle in one step. NEVER run it (or raw opennext) while CMS `npm run dev`
  (port 3601) is up.
- The kit envelope's `tag` always stays the SOURCE tag even when `name` overrides
  the display name — import still tags installed components by the tag, not the name.

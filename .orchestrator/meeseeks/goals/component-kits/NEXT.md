# Note to the next Meeseeks (component-kits)

ALL slices DONE (1-10). The CORE goal (tag components → export by tag as a kit →
preview → import → per-component result → rail grouping by kit/tag → kit name+desc
metadata → BULK tag editing) is fully delivered AND polished. No open TODO, no bugs.

Slice 10 (this run): bulk tag editing. Pure `applyBulkTag(components, tag, op)` in
`lib/components/tags.ts` (returns only components whose tag set actually changes,
case-insensitive, no-ops omitted). UI got a per-row checkbox + select-all-visible +
a bulk bar (tag input w/ datalist, Add/Remove to selected, Clear) that loops the
EXISTING tags-only PATCH /api/components per changed component — no new endpoint.
11 i18n keys EN/FI/ET. 6/6 node tests; tsc + opennext gate green; cms-bundle regen.

THE GOAL IS EFFECTIVELY COMPLETE. The user's directive (component tagging +
export-by-tag) plus all the value-adds above is satisfied. Remaining ideas are
diminishing-returns — judge value HARD before doing one; prefer a small hardening/
test slice over inventing busywork:
- **Multi-tag filter/export (AND/OR)** — only worth it if operators accumulate many
  tags and a single-tag filter feels limiting. Not requested.
- **A "kits" overview** — list distinct tags w/ component counts + one-click export
  per tag (vs select-then-export). Minor convenience.
- **Hardening**: the bulk PATCH loop is N sequential requests (fine for the small
  component counts here — ponytail). If a Site ever has hundreds of components and
  bulk-tagging feels slow, add a batch PATCH endpoint that takes
  `[{name, tags}]` and one D1 transaction. Upgrade path only; don't build pre-need.
If none reads as genuinely valuable, SAY the goal is complete and do a small
test-coverage slice rather than busywork.

WATCH OUT:
- The opennext gate can fail on a STALE `next build` lock (trace points at
  page-builder-shell:1146 — RED HERRING). See CAVEATS top entry. Don't run a
  standalone `next build` to "debug". pkill + rm -rf .next.
- STAGE ONLY YOUR OWN PATHS. Your only PM file is
  `ProjectManager/src/lib/deploy/cms-bundle.generated.js`. NEVER `git add -A`
  (parallel workers leave PM/chat/page-builder files dirty in the shared tree).
- `npm run bundle:cms` (from ProjectManager/) IS the opennext gate AND regens the PM
  bundle in one step. NEVER run it while CMS `npm run dev` (port 3601) is up.
- The Bash tool's working dir can silently be the repo ROOT (no tsconfig there → a
  bare `npx tsc --noEmit` exits 0 meaninglessly). Confirm `pwd` is .../CMS before
  trusting a tsc run.
- Runtime imports in pure/tested `.ts` must use relative paths, not `@/` (node
  --test can't resolve the alias). `applyBulkTag` lives in `tags.ts` which is already
  `@/`-free for runtime; the test imports it via `../src/lib/components/tags.ts`.

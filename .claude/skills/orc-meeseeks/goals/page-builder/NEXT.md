# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render+search+
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview + Right-rail SEO form +
DnD slices 1/2/3 + Section→Columns model + Block-tab Section settings + Component props-schema FOUNDATION +
BLOG + LANDING + **DOCS kit schema upgrade — THIS run**.

**ALL 3 KIT SCHEMA UPGRADES ARE NOW DONE (blog + landing + docs).** Each kit's propsSchema now declares
`required`/`translatable`/`label` on text props; code/identifier/URL props are NON-translatable. NO
number/boolean/select were added anywhere — bizbee's renderer binds `{{slot}}` text ONLY (no generic
prop→attribute/config binding), so a config field nothing references would be dead editor metadata. Keep
that rule for any future kit/schema work.

**DOCS upgrade — DONE this run.** `lib/components/docs-kit.ts` (only 5 components — the backlog hint's
"6th" never existed): DocsHeader title[req,t]/lead[t], Callout label[req,t]/body[req,t], CodeBlock
filename[req]/code[richtext,req] (NOT translatable — source), StepList heading[req,t]+step{1,2,3}Title[req,t]/
Body[t], ApiParam name[req]+paramType[req] (NOT translatable — identifiers) + description[req,t]. Extended
`scripts/docs-kit.test.mjs` (+1 test, 6/6).

**Next valuable slice toward GOAL.md** (no kit work left). Ideas, in rough priority:
- The richer Block-tab controls / surfacing the schema `label`s in the component settings form — verify
  `ComponentSettings` in `page-builder-shell.tsx` already renders one input per `PropField` with the new
  labels + per-locale translatable inputs (FOUNDATION run wired this; sanity-check it works against a real
  installed kit component). If anything is rough (e.g. richtext shows a single-line input), polish it.
- Undo/redo wiring in the top bar (still placeholder buttons from the LAYOUT slice).
- Layers panel node delete / visibility toggle (reorder + cross-column move already done in DnD slice 3).

⚠️ **PM BUNDLE STILL OWED (from the column-model RENDER run, NOT a kit run).** Kit-schema upgrades change only
editor metadata (propsSchema), NOT render output, so they add NO new bundle obligation. The
`ProjectManager/src/lib/deploy/cms-bundle.generated.js` is still behind on the Section grid render from the
column-model run; cosmetically stale until a render-touching run or the user approves a regen. When a run
OWNS the bundle: `cd ProjectManager && npm run bundle:cms`, grep-verify + `node -e import()` smoke.

Gate: CMS `npx tsc --noEmit` → `node --test scripts/<kit>-kit.test.mjs` (kit tests are `.mjs` under scripts/,
RELATIVE `.ts` imports — node can't resolve `@/`; `parsePropsSchema` imports from
`../src/lib/pages/page-blocks.ts`) → `npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free).
i18n (if any) under `pageBuilder.*`/`components.*` in `CMS/messages/{en,fi,et}.json` (2-SPACE indent).
Stage ONLY CMS page-builder files + goals/page-builder/* by explicit path — NO `git add -A`, NEVER touch
cms-bundle.generated.js unless your task owns it.

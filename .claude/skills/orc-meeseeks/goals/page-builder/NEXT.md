# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render+search+
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview + Right-rail SEO form +
DnD slices 1/2/3 + Section→Columns model + Block-tab Section settings + **Component props-schema FOUNDATION
(richer field vocab + Block-tab settings form) — THIS run**.

**FOUNDATION — DONE this run.** `parsePropsSchema` → `PropField[]` (string|richtext|number|boolean|select +
required/translatable/label/description/options/defaultValue; unknown→string). `validateBlockProps` overloaded:
`Set<string>` = legacy allowlist (C3 block-editor), `PropField[]` = schema-aware type-coercion + required
retention. New PURE `findBlock`/`mergeBlockProps` (tree-walk — nested components selectable). UI `ComponentSettings`
in page-builder-shell.tsx: one control per field; translatable text → per-content-locale inputs (`setLocalizedProp`);
persists via existing block PUT. New `GET /api/components/palette` ({name,propsSchema}). i18n
`pageBuilder.componentNoProps` EN/FI/ET. tsc+opennext green; page-blocks-schema.test.ts 9/9, sections 19/19.

**The 3 kit-upgrade TODOs are now UNBLOCKED.** Strongest next task = one of them (parallelizable):
- **Upgrade BLOG kit schemas** (`lib/components/blog-kit.ts`) — replace flat `{type:"string"}` propsSchema with
  real field types/defaults/required (number/boolean/select where it fits, e.g. PostList limit=number,
  layout=select) AND `translatable:true` on every human-readable text prop (titles/body/author/labels). Markup
  UNCHANGED — only the propsSchema JSON. The FOUNDATION already parses+renders these; no helper change needed.
- **Upgrade LANDING kit** (`lib/components/landing-kit.ts`: Hero/FeatureGrid/CTABand/Testimonial/SiteFooter).
- **Upgrade DOCS kit** (`lib/components/docs-kit.ts`: DocsHeader/Callout/CodeBlock/StepList/ApiParam/+6th).
Reference the aicms real schemas (`/Users/valentindraganescu/git/dev/aicms`,
`src/modules/page-builder/lib/props_schema.ts` for the FieldType shape). Each kit task: pick ONE kit, enrich
every component's propsSchema, leave markup alone. NOTE: bizbee's schema is an OBJECT keyed by prop name
(`{title:{type,...}}`), aicms uses an ARRAY — keep bizbee's object shape, just widen the descriptor.

⚠️ **PM BUNDLE STILL OWED (from the column-model run, NOT this one).** This FOUNDATION run did NOT change render
output (only the editor + a new endpoint), so it adds no NEW render-bundle obligation — but the
`ProjectManager/src/lib/deploy/cms-bundle.generated.js` is still behind on the Section grid render from the
column-model run. A kit-upgrade task ALSO doesn't change render (propsSchema is editor metadata), so the bundle
stays cosmetically stale until a render-touching run or the user approves a regen. When a run OWNS the bundle:
`cd ProjectManager && npm run bundle:cms`, grep-verify + `node -e import()` smoke.

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (RELATIVE `.ts` imports — node can't resolve
`@/`) → `npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). i18n under `pageBuilder.*` in
`CMS/messages/{en,fi,et}.json` (2-SPACE indent, `json.dump(...,indent=2)`+`\n`). Stage ONLY CMS page-builder
files + goals/page-builder/* by explicit path — NO `git add -A`, NEVER touch cms-bundle.generated.js unless
your task owns it.

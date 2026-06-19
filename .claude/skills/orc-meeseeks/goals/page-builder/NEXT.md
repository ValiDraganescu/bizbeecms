# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render+search+
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview + Right-rail SEO form +
DnD slices 1/2/3 + Section→Columns model + Block-tab Section settings + Component props-schema FOUNDATION +
**BLOG kit schema upgrade (richer vocab) — THIS run**.

**BLOG kit upgrade — DONE this run.** Enriched `lib/components/blog-kit.ts` propsSchema descriptors:
`required:true` + `translatable:true` + `label` on each text prop (titles/date/author/body/bio/excerpt/
heading), `required` on the primary text of each component; `PostListItem.href` left NON-translatable (it's a
URL). KEPT bizbee's object-keyed schema shape (`{title:{type,...}}`) — only widened the descriptor. DID NOT
invent number/boolean/select props: the kit markup only binds text slots (PostList renders just `{{heading}}`,
its rows are static sample HTML), so a `limit=number`/`layout=select` would bind to nothing — markup must stay
UNCHANGED per spec. Extended `scripts/blog-kit.test.mjs` (+1 test, 6/6) → asserts each prop parses via
`parsePropsSchema` to a known type, title=req+translatable, href NOT translatable, body=richtext+translatable.
tsc + opennext build green.

**Next strongest tasks = the 2 remaining kit upgrades (parallelizable, same pattern):**
- **Upgrade LANDING kit** (`lib/components/landing-kit.ts`: Hero/FeatureGrid/CTABand/Testimonial/SiteFooter).
  Same recipe: `translatable:true`+`label`+`required` on text props (headline/subhead/CTA label/testimonial
  body/footer text). LANDING is the kit where number/boolean/select MIGHT genuinely fit IF a component's
  markup actually binds such a prop — but CHECK the tree first: only add a field type the markup uses (the
  binder substitutes `{{prop}}` text slots, so a select/number that nothing references is dead metadata; keep
  markup UNCHANGED). Read landing-kit.ts before authoring.
- **Upgrade DOCS kit** (`lib/components/docs-kit.ts`: DocsHeader/Callout/CodeBlock/StepList/ApiParam/+6th).
  Same recipe. Callout `variant`=select / ApiParam `required`=boolean ONLY IF the markup binds them — verify.

Each kit task: pick ONE kit, read it, enrich every component's propsSchema (keep the object-keyed shape),
leave markup alone, extend that kit's `scripts/<kit>-kit.test.mjs` with a `parsePropsSchema` assertion.
KEY LESSON from this run: do NOT add props the markup doesn't bind, even if aicms's schema has them — bizbee
binds `{{slot}}` text only, so invented config props are inert. aicms reference (ARRAY-shaped schema, mine for
field-type IDEAS only): `/Users/valentindraganescu/git/dev/aicms` `src/modules/page-builder/lib/props_schema.ts`
+ `builtin_schemas.ts`.

⚠️ **PM BUNDLE STILL OWED (from the column-model RENDER run, NOT a kit run).** Kit-schema upgrades change only
editor metadata (propsSchema), NOT render output, so they add NO new bundle obligation. The
`ProjectManager/src/lib/deploy/cms-bundle.generated.js` is still behind on the Section grid render from the
column-model run; it stays cosmetically stale until a render-touching run or the user approves a regen. When a
run OWNS the bundle: `cd ProjectManager && npm run bundle:cms`, grep-verify + `node -e import()` smoke.

Gate: CMS `npx tsc --noEmit` → `node --test scripts/<kit>-kit.test.mjs` (the kit tests are `.mjs` under
scripts/, RELATIVE `.ts` imports — node can't resolve `@/`) → `npx opennextjs-cloudflare build` (dev STOPPED,
port 3601 free). i18n (if any) under `pageBuilder.*` / `components.*` in `CMS/messages/{en,fi,et}.json`
(2-SPACE indent). Stage ONLY CMS page-builder files + goals/page-builder/* by explicit path — NO `git add -A`,
NEVER touch cms-bundle.generated.js unless your task owns it.

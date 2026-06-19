# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render+search+
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview + Right-rail SEO form +
DnD slices 1/2/3 + Section→Columns model + Block-tab Section settings + Component props-schema FOUNDATION +
BLOG kit schema upgrade + **LANDING kit schema upgrade (richer vocab) — THIS run**.

**LANDING kit upgrade — DONE this run.** Enriched `lib/components/landing-kit.ts` propsSchema descriptors:
`required:true` + `translatable:true` + `label` on each text prop (Hero headline[req]/subhead/ctaLabel,
FeatureGrid heading[req]+feature{1,2,3}Title[req]/Body, CTABand title[req]/subtitle/ctaLabel, Testimonial
quote[req]/author[req]/role, SiteFooter tagline[req]/copyright). `ctaHref` (Hero+CTABand) = URL → label only,
NON-translatable. KEPT bizbee's object-keyed schema shape. NO number/boolean/select: kit markup binds only
`{{slot}}` text (e.g. FeatureGrid columns are static 3-up HTML, not a `columns` prop), so a select/number
would be dead metadata — markup UNCHANGED per spec. Extended `scripts/landing-kit.test.mjs` (+1 test, 6/6).
tsc + opennext build green.

**Next task = the LAST remaining kit upgrade (same pattern):**
- **Upgrade DOCS kit** (`lib/components/docs-kit.ts`: DocsHeader/Callout/CodeBlock/StepList/ApiParam/+6th).
  Same recipe: read docs-kit.ts FIRST, then `translatable:true`+`label`+`required` on each human-readable
  text prop (header title, callout body, step text, param name/description). CHECK the markup before adding
  ANY number/boolean/select — Callout `variant`=select / ApiParam `required`=boolean ONLY IF the component's
  `tree` actually binds them via `{{variant}}`/`{{required}}` text slots; bizbee has NO generic prop→attribute
  binding, so a field nothing references is dead editor metadata. URL/structural props (href, lang) NOT
  translatable. Extend `scripts/docs-kit.test.mjs` with a `parsePropsSchema` assertion (import it as
  `../src/lib/pages/page-blocks.ts`; node runs `.ts` directly, `@/` won't resolve). Markup UNCHANGED.

KEY LESSON (from BLOG + LANDING runs): do NOT add props the markup doesn't bind, even if aicms's schema has
them — bizbee binds `{{slot}}` text only, so invented config props are inert. aicms reference (ARRAY-shaped
schema, mine for field-type IDEAS only): `/Users/valentindraganescu/git/dev/aicms`
`src/modules/page-builder/lib/props_schema.ts` + `builtin_schemas.ts`.

After DOCS, all 3 kits are upgraded — pick the next valuable slice toward GOAL.md (e.g. wire the per-kit
schema labels into i18n if any UI surfaces them, or richer Block-tab controls).

⚠️ **PM BUNDLE STILL OWED (from the column-model RENDER run, NOT a kit run).** Kit-schema upgrades change only
editor metadata (propsSchema), NOT render output, so they add NO new bundle obligation. The
`ProjectManager/src/lib/deploy/cms-bundle.generated.js` is still behind on the Section grid render from the
column-model run; cosmetically stale until a render-touching run or the user approves a regen. When a run
OWNS the bundle: `cd ProjectManager && npm run bundle:cms`, grep-verify + `node -e import()` smoke.

Gate: CMS `npx tsc --noEmit` → `node --test scripts/<kit>-kit.test.mjs` (kit tests are `.mjs` under scripts/,
RELATIVE `.ts` imports — node can't resolve `@/`) → `npx opennextjs-cloudflare build` (dev STOPPED, port 3601
free). i18n (if any) under `pageBuilder.*`/`components.*` in `CMS/messages/{en,fi,et}.json` (2-SPACE indent).
Stage ONLY CMS page-builder files + goals/page-builder/* by explicit path — NO `git add -A`, NEVER touch
cms-bundle.generated.js unless your task owns it.

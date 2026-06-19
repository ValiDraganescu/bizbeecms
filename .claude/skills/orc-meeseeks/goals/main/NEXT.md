# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS; NO server eval). Mine `../aicms` for generic *mechanics* only; port Postgres→D1, keep R2. NEVER port aicms entity tables.

## Loop mode (from driver hint)
Plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## ⚠️ PARALLEL TRACK WARNING (read before committing)
A `goal-page-builder` loop edits the **block-editor / page-builder / props-schema** area + `binding-adapters/BACKLOG.md` + sometimes `deployer/src/index.ts`, and it ALSO heavily edits `goals/main/BACKLOG.md` (this run it condensed the whole G section). **Scope your `git add` to YOUR files** (don't `git add -A`) — and re-Read BACKLOG.md right before editing it (it WILL have moved under you). This run's pricing-kit change was conflict-free.

## ⚠️ HITL (still open): the live CMS Site must be REDEPLOYED for the AI-Gateway slug fix (`bizbeecms-ai-gateway`, baked at deploy time — see HITL.md). NO open bugs in BACKLOG.md `## Bugs`.

## JUST DONE (2026-06-19 19:06) — G5 pricing/e-commerce kit
Fifth premade kit. `CMS/src/lib/components/pricing-kit.ts` (PricingHeader, PricingTier, FeatureRow, ProductCard, PricingFaqItem) wired the standard way (KITS registry + manager const + installPricingKit i18n EN/FI/ET + kitsHint + scripts/pricing-kit.test.mjs). CMS 359/359, PM 79/79, gates green, bundle 6663KB. The gate accepts `<img>` tags + inline `style` object props — useful for future kits.

## The kit recipe is now BULLETPROOF — 5 kits in (blog/landing/docs/portfolio/pricing). ~10-min slice:
copy a `<x>-kit.ts` → new `lib/components/<x>-kit.ts` (5 bundles) + ONE `{id,build,names}` in the `KITS` array (`api/components/kit/route.ts`) + ONE `{id,labelKey}` in the `KITS` const (`components-manager.tsx`) + `install<X>Kit` i18n (3 catalogs) + extend `kitsHint` (3 catalogs) + `scripts/<x>-kit.test.mjs` (copy pricing's). EVERY className MUST be in `allowedClasses()` (utility-css.ts) — `rounded-md`/`grid-cols-5`/`text-6xl`/`line-through`/`aspect-*` do NOT exist; one-off values via inline `style` object. Prose props `translatable:true`; money/URL/identifier/date-range props `false`.

## Next valuable slice — pick ONE (keep diversifying; lean toward UNTOUCHED-by-page-builder areas):
1. **G6 kit** — events / restaurant-menu / real-estate / team-about (same recipe above, ~10 min). Good safe diversifier away from the page-builder track.
2. **Admin-UX / empty-state polish** — e.g. an empty-state for `/admin/components` (no components yet → guide to install a kit or chat), `/admin/pages` empty state, `/admin/media` empty state. UNTOUCHED-by-page-builder admin chrome.
3. **Translate-tool / settings polish** — small CMS slices.
4. **PM-side slices** (AVOID F1/D2/Z1 — removed; AVOID the live-deploy HITL items).

## Gotchas (read ALL of CAVEATS)
- Run CMS commands inside `CMS/`; PM inside `ProjectManager/`. orc-meeseeks skill + goals at REPO ROOT `.claude/skills/...`.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regen `cms-bundle.generated.js` (~6.6MB). Deploy gate = `npx opennextjs-cloudflare build` (runs inside bundle:cms); NEVER run while a dev server is on 3601/3602.
- `node --test scripts/` FAILS on Node v24 — use `npm test` (globs `scripts/*.test.mjs`). Dep-free `.mjs` importing `.ts` via relative paths, NO `@/` alias.
- NO server eval on Workers; NO server actions (REST route handlers only). Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET parity, test-locked).
- `upsertImportedComponent(component, undefined, kitId)` takes a kit-id 3rd arg now (page-builder track added kit-grouping) — the kit route already passes `id`.

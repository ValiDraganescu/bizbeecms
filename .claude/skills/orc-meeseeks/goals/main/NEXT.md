# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS; NO server eval). Mine `../aicms` for generic *mechanics* only; port Postgres→D1, keep R2. NEVER port aicms entity tables.

## Loop mode (from driver hint)
Plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## ⚠️ PARALLEL TRACK WARNING (read before committing)
A `goal-page-builder` loop is editing the **block-editor / page-builder / props-schema** area on the SAME tree. To dodge the `git add -A` race, **scope your `git add` to YOUR files** (don't `git add -A`). CMS suite was GREEN both before (347/347) and after my run (353/353) — the earlier "8 pre-existing failures" were fixed by the page-builder track (commit `01720c2`). Still: `git diff --stat` failing test files first if a suite breaks; don't assume it's yours.

## ⚠️ HITL (still open): the live CMS Site must be REDEPLOYED
The 2026-06-19 AI-Gateway slug fix (`bizbeecms-ai-gateway`) is baked at deploy time — see HITL.md. NO open bugs in BACKLOG.md `## Bugs`.

## JUST DONE (2026-06-19 18:57) — G4 portfolio kit (#4 kit)
Fourth premade kit shipped following the EXACT documented pattern. KITS registry now has blog/landing/docs/portfolio. The kit-add recipe is dead simple (~10 min): new `CMS/src/lib/components/<x>-kit.ts` (copy `portfolio-kit.ts` end-to-end) + one entry in the `KITS` array (`api/components/kit/route.ts`) + one in the `KITS` const (`components-manager.tsx`) + `install<X>Kit` i18n (3 catalogs) + extend `kitsHint` (3 catalogs) + `scripts/<x>-kit.test.mjs` (copy the portfolio test). Every className MUST be in `allowedClasses()` (utility-css.ts; note `rounded-md`/`grid-cols-5`/`text-6xl` do NOT exist); one-off values via inline `style`. Mark prose props `translatable:true`, identifiers/URLs/date-ranges `false`.

## Next valuable slice — pick ONE (lean toward an UNTOUCHED-by-page-builder track):
1. **G5 — e-commerce-landing kit** (or pricing kit) — same ~10-min recipe as above, copy `portfolio-kit.ts`. Low risk (mostly new files), but kit files live in the CMS tree the page-builder track also touches — keep `git add` scoped.
2. **"View site" sidebar link task** (BACKLOG "Move View site to top + new tab") — touches `CMS/src/components/admin-sidebar.tsx`, a page-builder-adjacent file, so check `git status` for their in-flight edits first.
3. **Translate-tool / settings polish** — small CMS slices.
4. **PM-side slices** (deploy fleet view was contested/AVOID per F1; only pick PM work the hint hasn't ruled out).

## Settings/admin + kit patterns are WELL-TRODDEN — reuse (see CAVEATS for the full per-feature "is built" entries).

## Gotchas (read ALL of CAVEATS)
- Run CMS commands inside `CMS/`; PM inside `ProjectManager/`. orc-meeseeks skill + goals at REPO ROOT `.claude/skills/...`.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regen `cms-bundle.generated.js` (~6.6MB). Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602; clean `.next .open-next` (CMS + PM) after gating.
- NO server eval on Workers; NO server actions (REST route handlers only). Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET parity, test-locked).
- New admin `/api/*` route → add `requireAdmin`. CMS public route is the optional catch-all — root `/` needs a published `home` slug or 404s (by design).

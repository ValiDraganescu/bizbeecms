# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS; NO server eval). Mine `../aicms` for generic *mechanics* only; port Postgres→D1, keep R2. NEVER port aicms entity tables.

## Loop mode (from driver hint)
Plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## ⚠️ PARALLEL TRACK WARNING (read before committing)
A `goal-page-builder` loop edits the **block-editor / page-builder / props-schema** area + sometimes `deployer/src/index.ts` + `binding-adapters/BACKLOG.md`. To dodge the `git add -A` race, **scope your `git add` to YOUR files** (don't `git add -A`). This run's sidebar change was conflict-free; the contested working-tree files were `binding-adapters/BACKLOG.md` + `deployer/src/index.ts` (left untouched by me).

## ⚠️ HITL (still open): the live CMS Site must be REDEPLOYED
The 2026-06-19 AI-Gateway slug fix (`bizbeecms-ai-gateway`) is baked at deploy time — see HITL.md. NO open bugs in BACKLOG.md `## Bugs`.

## JUST DONE (2026-06-19 19:00) — "View site" sidebar UX (diversified off the kit streak)
Moved "View site" to the FIRST nav item in `admin-sidebar.tsx`, plain `<a target="_blank" rel="noopener noreferrer">` with a new `ExternalLinkIcon`, prominent bordered style, collapsed icon-only w/ tooltip; removed the duplicate footer link. CMS 353/353, PM 79/79, gates green, bundle regen.

## Next valuable slice — pick ONE (keep diversifying; lean toward UNTOUCHED-by-page-builder areas):
1. **G5 — e-commerce / pricing kit** — same ~10-min recipe (copy `portfolio-kit.ts`): new `CMS/src/lib/components/<x>-kit.ts` + one entry in the `KITS` array (`api/components/kit/route.ts`) + one in the `KITS` const (`components-manager.tsx`) + `install<X>Kit` i18n (3 catalogs) + extend `kitsHint` (3 catalogs) + `scripts/<x>-kit.test.mjs`. Every className MUST be in `allowedClasses()` (utility-css.ts; `rounded-md`/`grid-cols-5`/`text-6xl` do NOT exist); one-off values via inline `style`. Mark prose props `translatable:true`, identifiers/URLs/date-ranges `false`. (Kit files live in the CMS tree the page-builder track also touches — keep `git add` scoped.)
2. **More small admin-UX polish** (the sidebar task was a good diversifier) — e.g. active-state for the new "View site" item is intentionally none (it's external); look for other admin chrome rough edges.
3. **Translate-tool / settings polish** — small CMS slices.
4. **PM-side slices** the hint hasn't ruled out (AVOID F1/D2/Z1).

## Settings/admin + kit patterns are WELL-TRODDEN — reuse (see CAVEATS for the full per-feature "is built" entries).

## Gotchas (read ALL of CAVEATS)
- Run CMS commands inside `CMS/`; PM inside `ProjectManager/`. orc-meeseeks skill + goals at REPO ROOT `.claude/skills/...`.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regen `cms-bundle.generated.js` (~6.6MB). Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602; clean `.next .open-next` (CMS + PM) after gating.
- NO server eval on Workers; NO server actions (REST route handlers only). Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET parity, test-locked).
- New admin `/api/*` route → add `requireAdmin`. CMS public route is the optional catch-all — root `/` needs a published `home` slug or 404s (by design).
- External nav OUT of admin (e.g. "View site") → plain `<a target="_blank" rel="noopener noreferrer">`, NOT `next/link`.

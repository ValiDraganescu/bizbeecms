# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS; NO server eval). Mine `../aicms` for generic *mechanics* only; port Postgres→D1, keep R2. NEVER port aicms entity tables.

## Loop mode (from driver hint)
Plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## ⚠️ PARALLEL TRACK WARNING (read before committing)
A `goal-page-builder` loop is editing the **block-editor / page-builder** area on the SAME tree (recent commits `912b494`..`16a73a0`: DnD slices, Section→Columns, props-schema FOUNDATION). To dodge the `git add -A` race, **scope your `git add` to YOUR files** (don't `git add -A`). Also: as of 2026-06-19 18:39 the CMS suite has **8 PRE-EXISTING failures** (`component-store.test.mjs` + `parsePropsSchema`) introduced by that track's props-schema commits — NOT a render bug. See CAVEAT. Don't assume your change broke them; `git diff --stat` the failing files first.

## ⚠️ HITL (still open): the live CMS Site must be REDEPLOYED
The 2026-06-19 BUG P1 AI-Gateway slug fix (`bizbeecms-ai-gateway`) is baked at deploy time — see HITL.md. NO open bugs remain in BACKLOG.md `## Bugs`.

## JUST DONE (2026-06-19 18:39) — nested-component render gap CLOSED (#5)
`planTree` now resolves PascalCase tags to real components (composition-by-tag) — binds props into nested `{{slots}}`, ships nested scripts once, depth-guarded, wave-based transitive fetch in `render-page.tsx`. See JOURNAL + CAVEAT "Nested-component composition-by-tag IS BUILT". This UNLOCKS kits authoring components that reference each other by tag (e.g. a PostList rendering AuthorCard).

## Next valuable slice — pick ONE (lean toward an UNTOUCHED-by-page-builder track):
1. **F1 — PM deploy fleet view (PM-side, untouched track — strongly preferred).** PM dashboard listing all Sites' deploy status + stuck flags. Pure PM work, zero overlap with the page-builder loop on the CMS tree. Reuse `lib/deploy/deploy-state.ts` predicates + `site.status`. NOTE: F1 was earlier "removed from the backlog" per a driver hint, but as a PM-side fleet VIEW it's still a clean, valuable, conflict-free slice — confirm with the hint before investing big.
2. **D2 — Cloudflare Images transforms** (optional, smaller; CMS media side).
3. **G4+ — more kits** (portfolio / pricing / e-commerce-landing). Kit infra is the `KITS` REGISTRY — adding one is ~10 min: new `CMS/src/lib/components/<x>-kit.ts` + one entry in the `KITS` array (`api/components/kit/route.ts`) + one in `KITS` const (`components-manager.tsx`) + `install<X>Kit` i18n (3 catalogs) + extend `kitsHint` + `scripts/<x>-kit.test.mjs`. **NOW that composition-by-tag renders, a kit can author components that reference each other by PascalCase tag** (e.g. PostList → AuthorCard). Every className must be in `allowedClasses()`; one-off values via inline `style`. Copy `docs-kit.ts` end-to-end. CAUTION: kits live in the CMS tree the page-builder track also touches — prefer #1/#2 to avoid the race.
4. **Translate-tool / settings polish** — small CMS slices if you want.

## C2 metadata per-locale editor — NOT NEEDED (verified 2026-06-19 18:39):
The hint suggested applying per-content-locale UI to C2 page metaTitle/metaDescription. It's ALREADY a per-locale editor: `pages-manager.tsx` renders one field per content locale (`locales.map`) and writes a `Record<locale,string>` map via `setLocaleValue` — which is the correct storage shape for `resolveLocalized` (a locale object). Forcing block-prop's `setLocalizedProp` here would be a regression (it collapses to a bare string; metadata is always a map). Skip it.

## Settings/admin pattern is WELL-TRODDEN — reuse:
PURE normalize/validate logic in `lib/...` (never `db/*` — drizzle import breaks node --test; import sibling source with `.ts` extension) → `db/*-store.ts` typed accessor → REST `api/.../route.ts` GET/PUT (server re-validates, NO server actions, **requireAdmin-gated**) → `/admin/.../page.tsx` (force-dynamic, try/catch → safe default offline) + `"use client"` editor `fetch`ing the route → EN/FI/ET namespace (key parity test-locked). **New admin section?** also add it to `ADMIN_SECTIONS` in `CMS/src/components/admin-nav.tsx` + `adminNav.<key>`/`adminNav.desc.<key>` in all 3 catalogs (test-locked in admin-nav.test.mjs).

## Gotchas (read ALL of CAVEATS, esp. per-feature "is built" entries)
- **NEW admin `/api/*` route → add `requireAdmin`.** A new `/admin/*` page inherits the layout guard but its data route MUST still be gated.
- Run CMS commands inside `CMS/`; PM inside `ProjectManager/`. orc-meeseeks skill + goals at REPO ROOT `.claude/skills/...`.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regen `cms-bundle.generated.js` (~6.6MB now). Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602; clean `.next .open-next` (CMS + PM) after gating.
- NO server eval on Workers; NO server actions (REST route handlers only). Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET parity).
- **Three page write contracts — don't merge:** AI `upsertPage` (blocks+parent), C2 `upsertPageMeta` (metadata, preserves blocks), C3 `setPageBlocks` (blocks-only, preserves metadata).
- CMS public route is the optional catch-all — don't re-add a static `app/page.tsx`. Root `/` needs a published `home` slug or 404s (by design). Serve assets at `/media/<key>`.

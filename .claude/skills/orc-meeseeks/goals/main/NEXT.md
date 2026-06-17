# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container), with stuck-deploy detect/cancel/restart.

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval — runs on Workers as-is). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables (artwork/product/order/…). The M2 epics are in BACKLOG.md "## Milestone 2 epics".

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable slice you CAN finish OFFLINE and do that. Prefer offline-verifiable M2 slices.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE:** A1 (D1 schema), A2 (render-plan walker + public `[[...slug]]` route), A3 (precompiled bounded utility CSS, inline).
- **B (AI assistant) — B1, B2, B3 DONE (offline cores):**
  - B1: CMS AI chat endpoint, streaming SSE, no tools. `api/chat/route.ts` + pure `lib/chat/sse.ts`.
  - B2: tool create_component. `lib/chat/component-tool.ts` + `db/component-store.ts`.
  - **B3 DONE (this run, offline core):** tool create_page. `lib/chat/page-tool.ts` (`CREATE_PAGE_TOOL` + PURE `validatePageInput`: slug/parent/publishStatus/block-tree-shape via `planPage`, returns referenced `componentNames`) + `db/page-store.ts` (`missingComponents` + `upsertPage` parentSlug→id, UNIQUE(parent,slug)) + route `runTools` refactored to a name-dispatcher. CMS 79/79, tsc + opennext gate clean, PM bundle regen + 32/32. See CAVEATS "CMS create_page tool (B3)".

## Next valuable slice — pick ONE (B4 needs C1 first; C1 is the natural offline next):
1. **C1 — per-Site content locales** (FULLY offline-verifiable, no CF dependency, unblocks B4). Data-driven content-language set (distinct from EN/FI/ET admin UI). `page.metaTitle/metaDescription` ALREADY store per-locale JSON maps + the route's `localized()` resolves them — extend that resolution+fallback pattern to block/component CONTENT (text props per-locale). Mine aicms for the resolution/fallback shape (a `{locale: value}` map with a site default + fallback chain). Decide where the per-Site content-locale SET is configured/stored (a settings row/KV — see USER note: content-locale config lives in a NEW D1/KV binding on the CMS app, not PM's D1). Keep it a pure, node-testable resolver (`resolveLocalized(map, locale, fallbacks)`) + wire it into `tree.ts`/the route. Zero CF auth needed to verify.
2. **B4 — tool: translate** — port aicms's AI translate tool against per-Site content locales. BLOCKED on C1 (needs the content-locale model first). Do C1, then B4.

**Lean C1** — it's fully offline, it's the documented next dependency for B4, and the per-locale-map foundation (metaTitle/metaDescription + route `localized()`) is already half-built. After C1, B4 (translate tool, mirror B2/B3 shape again) is the clean follow-up.

## Gotchas (and see CAVEATS — read all)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. DEPLOY.md is at REPO ROOT.
- New node-testable CMS source that imports OTHER source modules: use relative `.ts` imports (NOT `@/` — node can't resolve the alias). CMS tsconfig has `allowImportingTsExtensions:true`.
- New AI tool = new `runTools` handler branch + add the schema to the `TOOLS` array in `api/chat/route.ts` (now a name-dispatcher, see B3).
- After ANY `CMS/` change: `npm run cf-typegen` (CMS) if you touched wrangler bindings, AND `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` — else deploys ship a stale CMS.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (CMS + PM both, since bundle:cms re-builds CMS).
- NO server eval on Workers; NO server actions (REST route handlers only). Render the artifact `tree` via `render/`; `script`/CSS ship as strings/inline for the BROWSER.
- CMS tests: `node --test scripts/*.test.mjs`. Dep-free `.mjs`, no `@/` alias, no React/drizzle/opennext imports. `npm test` = 79/79.
- Utility CSS vocabulary is BOUNDED on purpose — extend explicitly via `utility-css.ts`; B2/B3 validate AI-emitted classes against `allowedClasses()`. New tools that accept classes must validate them too.
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx`. Root `/` needs a published page with slug `home` or it 404s (by design).
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity). Content locales are separate/data-driven (epic C1, next).

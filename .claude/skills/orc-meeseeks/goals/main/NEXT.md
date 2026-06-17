# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container), with stuck-deploy detect/cancel/restart.

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval — runs on Workers as-is). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables (artwork/product/order/…). The M2 epics are in BACKLOG.md "## Milestone 2 epics".

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable slice you CAN finish OFFLINE and do that. Prefer offline-verifiable M2 slices.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE:** A1 (D1 schema), A2 (render-plan walker + public `[[...slug]]` route), A3 (precompiled bounded utility CSS, inline).
- **B1 DONE:** CMS AI chat endpoint — streaming SSE, no tools. `api/chat/route.ts` + pure `lib/chat/sse.ts`.
- **B2 DONE (this run, offline core):** First AI tool — create/update component. `lib/chat/component-tool.ts` (`CREATE_COMPONENT_TOOL` schema + PURE `validateComponentArtifact` gate: tree via `planTree`, classes via `allowedClasses()` root+nested, name regex, 64KB script bound, accepts tree-as-JSON-string), `db/component-store.ts` (`upsertComponent`, name UNIQUE → update-or-insert), `sse.ts` (new `tool_call` event + `ToolCallAccumulator` reassembling streamed arg fragments by index + `frameEvent` widened to `tool`), route wired (`tools:[…]` + ONE tool round → `tool` event). CMS 61/61, tsc + opennext gate clean, PM bundle regen + 32/32. Live model tool-call + D1 write → HITL P1. See CAVEATS "CMS create_component tool (B2)".

## Next valuable slice — pick ONE:
1. **B3 — tool: create/compose page.** The natural next link (A done → B1 → B2 → B3). Add a SECOND tool (`create_page` / `compose_page`) the AI calls to assemble validated components into a page block tree → write to the `page` table (A1). Validate the block tree references known component names + a sane slug/publish status; the `planPage` walker (tree.ts) already renders a published page via A2. Proves end-to-end "ask AI for a page → it renders live." MOSTLY OFFLINE: mirror B2's shape exactly — tool schema + pure validator (`validatePageInput`: slug, parent, blocks reference existing components) + D1 upsert + add it to the route's `TOOLS` array + extend `runTools` with a `create_page` branch. The live multi-step (create components THEN compose) needs the model → HITL. This keeps proving the product vertically.
2. **C1 — per-Site content locales** (fully offline-verifiable). Data-driven content-language set (distinct from EN/FI/ET admin UI); locale-object storage + render-time resolution w/ fallback. `page.metaTitle/metaDescription` already store per-locale JSON maps + the route's `localized()` resolves them — extend that pattern to block/component content. Mine aicms for the resolution/fallback shape. Zero CF dependency.

**Lean B3** to keep the vertical thread (the AI can author a component → now teach it to compose a page from them). C1 is the fully-offline fallback if B3's tool-chaining feels too entangled to verify offline. Either is valid.

## Gotchas (and see CAVEATS — read all)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. DEPLOY.md is at REPO ROOT.
- New node-testable CMS source that imports OTHER source modules: use relative `.ts` imports (NOT `@/` — node can't resolve the alias). CMS tsconfig now has `allowImportingTsExtensions:true` for this. See CAVEATS "B2".
- After ANY `CMS/` change: `npm run cf-typegen` (CMS) if you touched wrangler bindings, AND `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` — else deploys ship a stale CMS.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (CMS + PM).
- NO server eval on Workers; NO server actions (REST route handlers only). Render the artifact `tree` via `render/`; `script`/CSS ship as strings/inline for the BROWSER.
- CMS tests: `node --test scripts/*.test.mjs` (bare `scripts/` dir form fails on Node v24). Dep-free `.mjs`, no `@/` alias, no React/drizzle/opennext imports. `npm test` = 61/61.
- Utility CSS vocabulary is BOUNDED on purpose — extend explicitly via `utility-css.ts`; B2 already validates AI-emitted classes against `allowedClasses()`. New tools that accept classes must validate them too.
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx`. Root `/` needs a published page with slug `home` or it 404s (by design).
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity). Content locales are separate/data-driven (epic C1).

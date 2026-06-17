# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container), with stuck-deploy detect/cancel/restart.

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables. The M2 epics are in BACKLOG.md "## Milestone 2 epics".

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE:** A1 (D1 schema), A2 (render-plan walker + public `[[...slug]]` route), A3 (precompiled bounded utility CSS).
- **B (AI assistant) — B1, B2, B3, B4 DONE (offline cores):** chat SSE / create_component / create_page / **translate** tools. All four pure cores unit-tested; live model+D1 → HITL P1 lines.
- **C1 DONE:** per-Site content locales (`lib/render/localize.ts` `resolveLocalized`/`normalizeContentLocales`, `db/settings-store.ts`, `site_settings` D1 table, public route resolves per content locale).
- **B4 DONE this run (offline core):** `translate(kind,target,fields)` tool. PURE `lib/chat/translate-tool.ts` = schema + `validateTranslationInput` (locale-object validated against the Site's `getContentLocales` set) + `mergePageFields` (non-mutating merge into metaTitle/metaDescription + `<blockId>.<propName>` → locale objects). D1 write `db/translate-store.ts` `applyTranslation` (page lookup-by-slug → merge → write; **component targets rejected for now**). Route `TOOLS` + `handleTranslate` branch. CMS 111/111, tsc + gate clean; PM bundle regen (4514KB) + 32/32 + gate. See CAVEATS "translate" + "pure helper not in db/".

## Next valuable slice — pick ONE:
1. **C1b — content-locale settings UI** (the natural next; B4 *needs* `getContentLocales` to be populated to be useful live). A CMS admin page to view/add/remove content locales via a REST `route.ts` calling `setContentLocales`. **Blocker to mind:** CMS has NO UI component lib (PM has one under `src/components/ui`). Either use native controls (lazy, ship it) or port a minimal slice of PM's. i18n EN/FI/ET (CMS catalogs `messages/{en,fi,et}.json`, keep parity). The pure config logic (`normalizeContentLocales`/`getContentLocales`/`setContentLocales`) already exists — this is the UI + REST handler only.
2. **Next B/CMS epic from BACKLOG "## Milestone 2 epics"** — check what's queued after the B tools (assets/R2, settings, the chat UI front-end). The chat endpoint exists (B1-B4) but there's no in-browser chat UI to drive it — that may be the highest-value vertical slice (makes the whole AI assistant usable). Look at BACKLOG epics D/E/F.

**Lean toward C1b** — small, unblocks B4's live value (locales must be configured), and the pure layer is already done. If CMS still has no component lib, ship native controls + a `// ponytail:` note rather than porting PM's whole library.

## Gotchas (and see CAVEATS — read all)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. The orc-meeseeks skill + goals live at REPO ROOT `.claude/skills/...`, NOT in CMS.
- **New PURE helper you want node-tested must NOT live in a `db/*.ts` file** — those import `./index` (drizzle) at module top, which node --test can't resolve → whole module fails to load. Put pure logic in `lib/chat/` (or another dep-free module); the `db/` store imports it. (B4's `mergePageFields` lives in `translate-tool.ts` for this reason.)
- New node-testable CMS source importing OTHER source modules: relative `.ts` imports (NOT `@/` — node can't resolve the alias). CMS tsconfig has `allowImportingTsExtensions:true`.
- New AI tool = new `runTools`/`handleX` branch + add the schema to the `TOOLS` array in `api/chat/route.ts` (a name-dispatcher).
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` — else deploys ship a stale CMS. `npm run cf-typegen` (CMS) only if you touched wrangler bindings; `npm run db:generate` (CMS) only after a schema change. (B4 touched neither.)
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (CMS + PM both).
- CMS tests: `node --test scripts/*.test.mjs` = `npm test`, now **111/111**. Dep-free `.mjs`, no `@/` alias, no React/drizzle/opennext imports.
- NO server eval on Workers; NO server actions (REST route handlers only). Render the `tree` via `render/`; `script`/CSS ship as strings/inline for the BROWSER.
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx`. Root `/` needs a published page slug `home` or it 404s (by design).
- Content locales (C1): localized content = inline `{en,fi,...}` locale objects resolved by `resolveLocalized`; the content-locale SET lives in `site_settings` (read via `getContentLocales`). SEPARATE from the fixed EN/FI/ET admin UI locale.
- B4 translate **rejects component targets** on purpose (translate the page whose blocks use the component). Not a bug — see CAVEATS.
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity).

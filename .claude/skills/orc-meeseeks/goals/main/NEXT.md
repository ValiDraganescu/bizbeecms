# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container), with stuck-deploy detect/cancel/restart.

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval — runs on Workers as-is). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables (artwork/product/order/…). The M2 epics are in BACKLOG.md "## Milestone 2 epics".

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable slice you CAN finish OFFLINE and do that. Prefer offline-verifiable M2 slices.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE:** A1 (D1 schema), A2 (render-plan walker + public `[[...slug]]` route), A3 (precompiled bounded utility CSS, inline).
- **B (AI assistant) — B1, B2, B3 DONE (offline cores):** chat SSE / create_component / create_page tools. See CAVEATS.
- **C1 DONE this run (offline core):** per-Site content locales. PURE `lib/render/localize.ts` (`resolveLocalized` deep locale-object resolution + `normalizeContentLocales` config model), wired into `tree.ts` `planTree`/`planPage` via optional `LocaleContext`, stored in new generic `site_settings` D1 table (`db/settings-store.ts`, migration `0001_easy_namor.sql`), public route resolves blocks + meta per content locale. CMS 95/95, tsc + opennext gate clean, PM bundle regen + 32/32. See CAVEATS "CMS per-Site content locales (C1)".

## Next valuable slice — pick ONE:
1. **B4 — tool: translate** (NOW UNBLOCKED by C1; the natural next, mirrors B2/B3 exactly). The model reads a page/component's content + the Site's content-locale set (`getContentLocales`), emits per-locale values as locale-objects (`{en,fi,...}`) — which `resolveLocalized` already renders. Build: a `CREATE_TRANSLATION`/`translate` tool schema + PURE validator (in `lib/chat/`, validate the locale-object shape against allowed locale codes) + D1 write (update the page/component's localized fields) + a `runTools` dispatcher branch + add to `TOOLS` in `api/chat/route.ts`. Mine aicms `src/shared/lib/translation_service.ts` for the AI prompt/locale-name shape (it has a `locale_names` map). Fully offline-verifiable core (pure validator + tests); live model call → HITL P1 (same as B1/B2/B3).
2. **C1b — content-locale settings UI** — CMS admin page to view/add/remove content locales via a REST `route.ts` calling `setContentLocales`. Needs a CMS UI component lib (CMS has none — native controls or mine PM's). i18n EN/FI/ET. Pure config logic exists already.

**Lean B4** — it's the documented dependent of C1, it mirrors the proven B2/B3 tool shape (low risk), and its pure core is fully offline-testable. C1b is UI chrome that needs a CMS component lib first, so it's heavier; do B4 first.

## Gotchas (and see CAVEATS — read all)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. DEPLOY.md is at REPO ROOT.
- New node-testable CMS source that imports OTHER source modules: use relative `.ts` imports (NOT `@/` — node can't resolve the alias). CMS tsconfig has `allowImportingTsExtensions:true`.
- New AI tool = new `runTools` handler branch + add the schema to the `TOOLS` array in `api/chat/route.ts` (a name-dispatcher, see B3).
- After ANY `CMS/` change: `npm run cf-typegen` (CMS) if you touched wrangler bindings, AND `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` — else deploys ship a stale CMS. After a schema change: `npm run db:generate` (CMS) to emit a migration.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (CMS + PM both, since bundle:cms re-builds CMS).
- NO server eval on Workers; NO server actions (REST route handlers only). Render the artifact `tree` via `render/`; `script`/CSS ship as strings/inline for the BROWSER.
- CMS tests: `node --test scripts/*.test.mjs`. Dep-free `.mjs`, no `@/` alias, no React/drizzle/opennext imports. `npm test` = 95/95.
- Utility CSS vocabulary is BOUNDED on purpose — extend explicitly via `utility-css.ts`; tools validate AI-emitted classes against `allowedClasses()`.
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx`. Root `/` needs a published page with slug `home` or it 404s (by design).
- Content locales are SEPARATE from admin UI locale (C1, see CAVEATS): localized content = inline `{en,fi,...}` locale objects, resolved by `resolveLocalized`; the content-locale SET lives in the `site_settings` D1 table.
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity).

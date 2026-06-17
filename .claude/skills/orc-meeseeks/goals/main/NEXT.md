# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables. The M2 epics are in BACKLOG.md "## Milestone 2 epics".

> NOTE: the CAVEATS "STOP touching the CMS app" entry was an M1-era directive. M1 is done/live; we are now squarely in M2 where the CMS IS the product, so CMS feature work IS correct now (NEXT.md + GOAL.md M2 supersede it).

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE:** A1 (D1 schema), A2 (render-plan walker + public `[[...slug]]` route), A3 (precompiled bounded utility CSS).
- **B (AI assistant) COMPLETE (offline cores):** B1 chat SSE, B2 create_component, B3 create_page, B4 translate. Plus `/admin/chat` UI. Live model+D1 → HITL P1.
- **C1 + C1b DONE:** per-Site content locales (pure layer + D1 store + public route resolution) + the `/admin/settings/content-locales` settings UI.
- **D1 DONE this run:** R2 media assets — native `MEDIA` binding (no presigning), pure `lib/render/asset.ts`, `asset` D1 table (migration 0002), `db/asset-store.ts`, REST `api/assets`, serve route `/media/[...key]`, `/admin/media` gallery UI, `media` i18n. See CAVEATS "CMS R2 media assets". Live R2/D1 → HITL P1.

## Next valuable slice — pick ONE:
1. **Let the AI USE assets.** The media library exists but the AI can't reference uploads yet. Add a `list_assets` tool (or seed the chat system prompt with available `/media/<key>` URLs) so `create_component`/`create_page` can put real images in artifacts. Small, high-value, closes the D1 loop (upload → AI uses it). Mirror the B2/B3/B4 tool pattern (pure validator in `lib/chat/`, route handler branch, dispatcher). Pure parts offline-verifiable.
2. **C2 — page management UI** (slugs/publish/SEO/hierarchy/nav). The non-AI counterpart to B3. Mine aicms `site_tree_service`. Same admin-page+REST pattern (explicit `/admin/...` page + `route.ts`).
3. **E1 — per-Site theme overrides.** DB-backed CSS-var overrides in `site_settings` (table already exists!) injected as inline `<style>` after globals on the public route. Small + self-contained: a Site re-themes token colors without rebuild. Reuse the `site_settings` store + the C1b settings-page pattern.

**Lean toward #1 (AI uses assets)** — it closes the D1 loop and is a natural next step now that uploads work; #2 (page mgmt UI) or #3 (theme) are both strong self-contained alternatives.

## Gotchas (and see CAVEATS — read ALL, esp. "CMS R2 media assets" + "content-locale settings UI" + "CMS admin chat UI")
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. orc-meeseeks skill + goals live at REPO ROOT `.claude/skills/...`, NOT in CMS.
- **Admin chrome = explicit routes under `app/admin/...` (or `app/api/...`)** — they win over the public `[[...slug]]` catch-all. Pattern: explicit `page.tsx` (server, force-dynamic, try/catch the `db/*` call → safe default so it renders OFFLINE) + `"use client"` editor `fetch`ing a REST `route.ts` (NO server actions). Admin-page Tailwind gets real build-time scanning (NOT limited to the A3 bounded runtime vocabulary).
- **New PURE helper you want node-tested must NOT live in a `db/*.ts` file** — those import `./index` (drizzle) at module top → node --test can't resolve. Put pure logic in `lib/...`; the `db/` store imports it. node-testable CMS source importing OTHER source uses relative `.ts` imports (NOT `@/`). CMS tsconfig has `allowImportingTsExtensions:true`.
- **For a new admin i18n namespace, add a key-parity test** (copy `scripts/asset.test.mjs`'s parity block or `content-locales-ui.test.mjs`: recursive key-path deep-equal across EN/FI/ET + non-empty). CMS has no global parity test, only per-namespace ones.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` (now ~5.3MB) — else deploys ship a stale CMS. `npm run cf-typegen` (CMS) only after a wrangler binding change (e.g. the new MEDIA R2 binding); `npm run db:generate` (CMS) only after a schema change.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (CMS + PM both).
- CMS tests: `node --test scripts/*.test.mjs` = `npm test`, now **139/139**. Dep-free `.mjs`, no `@/` alias, no React/DOM/drizzle/opennext imports.
- NO server eval on Workers; NO server actions (REST route handlers only). Render the `tree` via `render/`; `script`/CSS ship as strings/inline for the BROWSER.
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx`. Root `/` needs a published page slug `home` or it 404s (by design). Serve assets at `/media/<key>` NOT `/_assets/` (Next private folder).
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity).

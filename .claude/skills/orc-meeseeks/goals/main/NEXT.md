# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables. The M2 epics are in BACKLOG.md "## Milestone 2 epics".

> NOTE: the CAVEATS "STOP touching the CMS app" entry was an M1-era directive. M1 is done/live; we are now squarely in M2 where the CMS IS the product, so CMS feature work IS correct now (NEXT.md + GOAL.md M2 supersede it).

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE:** A1 (D1 schema), A2 (render walker + public `[[...slug]]`), A3 (bounded utility CSS).
- **B (AI assistant) COMPLETE (offline cores):** B1 chat SSE, B2 create_component, B3 create_page, B4 translate. Plus `/admin/chat` UI.
- **C1 + C1b DONE:** per-Site content locales + `/admin/settings/content-locales` UI.
- **D1 + loop-closer DONE:** R2 media (gallery/upload/serve) + **`list_assets` AI tool** (this run) so create_component/create_page reference real `/media/<key>` URLs. **D loop is now closed.** Plus Sec2 (media serve XSS hardening) committed.
- 5 AI tools wired: create_component, create_page, translate, list_assets (+ the chat endpoint). Live model/D1/R2 round-trips ALL → HITL P1 (need AI binding+gateway+D1+R2).

## ⚠️ SECURITY: CMS admin surface is UNAUTHENTICATED (P0, found 2026-06-17)
Every `/admin/*` page + `/api/*` admin route (chat/settings/assets) is open to anyone on a deployed CMS Worker — the CMS ships NO auth module. See CAVEATS top entry + HITL P0 + BACKLOG **Sec1**. Highest-value non-bug work BUT needs an ARCH decision (share PM's KV session/JWT vs. standalone per-Site CMS auth) → logged HITL P0. If the user has answered it, **Sec1 is the slice to take** (gate all admin routes). Otherwise pick an offline slice below.

## Next valuable slice — pick ONE:
0. **Sec1 — CMS admin auth** (P0) — IF the user has chosen the arch (HITL P0). Else below.
1. **C2 — page management UI** (slugs/publish/SEO/hierarchy/nav). The non-AI counterpart to B3. Mine aicms `site_tree_service`. Same admin-page+REST pattern (explicit `/admin/...` page.tsx server-rendered with try/catch→safe default + `"use client"` editor fetching a `route.ts`). Add a key-parity i18n test (copy `content-locales-ui.test.mjs`). STRONG candidate — it's the obvious next authoring surface.
2. **E1 — per-Site theme overrides.** DB-backed CSS-var overrides in `site_settings` (table exists!) injected as inline `<style>` after globals on the public route. Small + self-contained: a Site re-themes token colors without rebuild. Reuse the `site_settings` store + C1b settings-page pattern.
3. **E2 — site settings (brand/design/AI persona).** The brand+design settings feed the AI system prompt. Builds on the `site_settings` store. Could naturally precede/pair with seeding the chat system prompt to mention `list_assets` + available components.
4. **G1 — blog component kit** (premade `{tree,script,css}` set seeded into a Site) — but H1/H2 export/import format should land first.

**Lean toward #1 (C2 page management UI)** — it's the obvious next authoring surface now that the AI tools + assets are all in, and it's fully offline-buildable. #2 (theme) is the smallest self-contained win.

## Gotchas (read ALL of CAVEATS, esp. the per-feature "is built" entries)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. orc-meeseeks skill + goals live at REPO ROOT `.claude/skills/...`, NOT in CMS.
- **Admin chrome = explicit routes under `app/admin/...` (or `app/api/...`)** — they win over the public `[[...slug]]` catch-all. Pattern: explicit `page.tsx` (server, force-dynamic, try/catch the `db/*` call → safe default so it renders OFFLINE) + `"use client"` editor `fetch`ing a REST `route.ts` (NO server actions). Admin-page Tailwind gets real build-time scanning (NOT the A3 bounded runtime vocabulary).
- **New PURE helper you want node-tested must NOT live in a `db/*.ts` file** (they import drizzle at module top → node --test can't load). Put pure logic in `lib/...`; the `db/` store imports it. node-testable CMS source importing OTHER source uses relative `.ts` imports (NOT `@/`). To ADD an AI tool: schema in `lib/chat/<x>-tool.ts` → add to `TOOLS` in `api/chat/route.ts` → dispatch branch + `handle<X>` (mirror `handleListAssets`). The `ToolCard` UI renders any new tool generically — no UI change needed.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regenerate `cms-bundle.generated.js` (~5.3MB). `npm run cf-typegen` (CMS) only after a wrangler binding change; `npm run db:generate` (CMS) only after a schema change.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602. Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (CMS + PM both).
- CMS tests: `node --test scripts/*.test.mjs` = `npm test`, now **148/148**. Dep-free `.mjs`, no `@/` alias, no React/DOM/drizzle/opennext imports.
- NO server eval on Workers; NO server actions (REST route handlers only). Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity).
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx`. Root `/` needs a published page slug `home` or it 404s (by design). Serve assets at `/media/<key>` NOT `/_assets/`.

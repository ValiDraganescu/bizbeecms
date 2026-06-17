# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables. The M2 epics are in BACKLOG.md "## Milestone 2 epics".

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE:** A1 (D1 schema), A2 (render-plan walker + public `[[...slug]]` route), A3 (precompiled bounded utility CSS).
- **B (AI assistant) COMPLETE (offline cores):** B1 chat SSE, B2 create_component, B3 create_page, B4 translate — full tool suite. Live model+D1 → HITL P1.
- **B-track chat UI DONE this run:** `/admin/chat` client page drives `/api/chat`, consumes the token/tool/done/error SSE, renders streaming transcript + tool-result cards. Pure node-tested parser `lib/chat/client-sse.ts`. The B-track is now USABLE in a browser (pending live AI binding = HITL P1). See CAVEATS "CMS admin chat UI".
- **C1 DONE:** per-Site content locales (`lib/render/localize.ts`, `db/settings-store.ts`, `site_settings` D1 table, public route resolves per content locale).

## Next valuable slice — pick ONE:
1. **C1b — content-locale settings UI** (`/admin/...` route). A CMS admin page to view/add/remove content locales via a REST `route.ts` calling `setContentLocales`. The pure config logic (`normalizeContentLocales`/`getContentLocales`/`setContentLocales`) already exists — this is the UI + REST handler only. **Now easier:** you have a pattern to copy — `/admin/chat`'s explicit-route page + `"use client"` component fetching a `route.ts`, native/purpose-token controls, the `chat` i18n namespace as a template. B4 translate *needs* content locales populated to be useful live, so this unblocks B4's live value.
2. **D1 — R2 asset upload + gallery.** R2 bucket binding + upload route + media-library admin UI (R2 is Workers-native — aicms's node:fs/pg caveats don't apply). Proves: upload an image → CDN URL → use in a component.
3. **C2 — page management UI** (slugs/publish/SEO/hierarchy/nav). Mine aicms `site_tree_service`.

**Lean toward C1b** — small, copies the chat-UI pattern, unblocks B4's live value, pure layer done. Build it as an explicit `/admin/...` route exactly like `/admin/chat` (explicit beats the `[[...slug]]` catch-all).

## Gotchas (and see CAVEATS — read ALL, esp. the new "CMS admin chat UI" entry)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. orc-meeseeks skill + goals live at REPO ROOT `.claude/skills/...`, NOT in CMS.
- **Admin pages are explicit routes under `app/admin/...` — they win over the public `[[...slug]]` catch-all** (Next route precedence). That's the pattern for ALL CMS admin chrome. Admin-page Tailwind classes get real build-time scanning (NOT limited to the A3 bounded runtime vocabulary — that bound only applies to AI-artifact classes walked at request time).
- **New PURE helper you want node-tested must NOT live in a `db/*.ts` file** — those import `./index` (drizzle) at module top → node --test can't resolve → whole module fails. Put pure logic in `lib/...`; the `db/` store imports it. New node-testable CMS source importing OTHER source uses relative `.ts` imports (NOT `@/` — node can't resolve the alias). CMS tsconfig has `allowImportingTsExtensions:true`.
- New AI tool = new `runTools`/`handleX` branch + add the schema to the `TOOLS` array in `api/chat/route.ts`.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` (now ~4.6MB) — else deploys ship a stale CMS. `npm run cf-typegen` (CMS) only after a wrangler binding change; `npm run db:generate` (CMS) only after a schema change.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (CMS + PM both).
- CMS tests: `node --test scripts/*.test.mjs` = `npm test`, now **127/127**. Dep-free `.mjs`, no `@/` alias, no React/DOM/drizzle/opennext imports.
- NO server eval on Workers; NO server actions (REST route handlers only). Render the `tree` via `render/`; `script`/CSS ship as strings/inline for the BROWSER.
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx`. Root `/` needs a published page slug `home` or it 404s (by design).
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity — the `chat` namespace is your newest template).

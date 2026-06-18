# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS; NO server eval). Mine `../aicms` for generic *mechanics* only; port Postgres→D1, keep R2. NEVER port aicms entity tables.

## Loop mode (from driver hint)
Plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE; B (AI assistant) COMPLETE (offline cores):** chat SSE + 5 tools (create_component, create_page, translate, list_assets) + `/admin/chat` UI + real system prompt (E2).
- **C1/C1b/C2/C3 DONE** + per-block props editing UI (binding loop CLOSED).
- **H1/H2/H3/H3b DONE:** component export/import with BOTH asset-URL deps AND nested-component deps declared/warned on import.
- **G1 DONE:** blog starter kit (template for future kits).
- **D1 + list_assets DONE; E1 + E2 DONE** (theme overrides + brand/AI-persona settings → AI prompt).
- **🔒 Sec1 DONE (2026-06-18, this run): CMS admin auth.** See below + JOURNAL 12:33 + CAVEAT "CMS admin auth IS BUILT".

## ✅ Sec1 — CMS admin auth is BUILT (this run). What landed:
- PM `POST /api/auth/cms-validate` (bearer `CMS_AUTH_SECRET` + forwarded `bizbee_session` cookie + `{siteId}` → `getCurrentUser` → `canManageSiteByCountry || isUserAssignedToSite` → `{ok,userId}`).
- CMS `lib/auth/guard-core.ts` (pure, node-tested) + `guard.ts` (`requireAdmin(request)` for API, `checkAdminFromHeaders()` for pages). FAIL-CLOSED.
- ALL admin `/api/*` routes gated (chat, settings/*, assets, pages, pages/[id]/blocks, components, components/kit POST). `/admin/*` layout guard. Public `[[...slug]]`/`/media`/`/api/health`/kit-GET stay open.
- `CMS/wrangler.jsonc` declares empty `SITE_ID`/`PM_ORIGIN`/`CMS_AUTH_SECRET` vars; deployer injects them per-Site via `--var`. EN/FI/ET `adminAuth` strings.
- **Live round-trip → HITL P1** (added this run): signed-out→401, PM user w/ site access→200, w/o→401; deployer must set `CMS_AUTH_SECRET`+`PM_ORIGIN`.

## Next valuable slice — pick ONE:
1. **H3b part 1 — editable asset-rebind UI** (DEFERRED, the last H-track polish). The format/validator/REST `{rebind}` hook + the nested-component dep WARNING are done; only the editable per-dep rebind picker remains. In `components-manager.tsx`: after a paste/upload/kit response returning `assets`, cross-check vs `GET /api/assets`, render a per-dep control (keep / rebind to a `/media/<key>` from the gallery / drop=null), build the `{rebind}` map, POST `{text|bundle, rebind}` — route ALREADY accepts `{rebind}`, validator done. Purely editor-UI.
2. **G2+ — more kits (landing/marketing, docs, portfolio).** Kit template proven (`lib/components/<x>-kit.ts` + kit route id + button). New kits should author `{{slots}}` + `propsSchema` from the start (see blog-kit.ts). Kit-install dep-check (H3b) excludes self-kit names before warning.
3. **Per-locale block-prop editing** (DEFERRED). A localized prop currently gets ONE text field writing a bare string (shows in all locales). To do per-locale: render N fields from `getContentLocales()`, write a `{en,fi,et}` object. `validateBlockProps` already keeps object values → editor-UI-only expansion.
4. **F1 — PM deploy fleet view.** PM dashboard listing all Sites' deploy status + stuck flags. PM-side.
5. **D2 — Cloudflare Images transforms** (optional, smaller).
6. **A shared admin nav** — admin pages are standalone routes with no nav between them. A small `/admin` index/nav linking chat/pages/components/media/settings would help (now that auth gates the whole surface, an admin landing page makes sense). Goes UNDER the new `/admin/layout.tsx` (already auth-guarded).

Lean toward #1 (finish H-track) or #2 (more kits). #6 is a nice small UX win now that the surface is gated.

## Settings/admin pattern is WELL-TRODDEN — reuse:
PURE normalize/validate logic in `lib/...` (never `db/*` — drizzle import breaks node --test; import sibling source with `.ts` extension) → `db/*-store.ts` typed accessor → REST `api/.../route.ts` GET/PUT (server re-validates, NO server actions, **now requireAdmin-gated**) → `/admin/.../page.tsx` (force-dynamic, try/catch → safe default offline; auto-covered by the admin layout guard) + `"use client"` editor `fetch`ing the route → EN/FI/ET namespace (key parity test-locked).

## Gotchas (read ALL of CAVEATS, esp. per-feature "is built" entries)
- **NEW admin `/api/*` route → add `requireAdmin` (see CAVEAT "CMS admin auth IS BUILT").** A new `/admin/*` page inherits the layout guard but its data route MUST still be gated.
- Run CMS commands inside `CMS/`; PM inside `ProjectManager/`. orc-meeseeks skill + goals at REPO ROOT `.claude/skills/...`.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regen `cms-bundle.generated.js` (~6.3MB now). `npm run cf-typegen` (CMS) only after a wrangler BINDING change (NOT needed for the Sec1 plain vars — read via cast). `npm run db:generate` (CMS) only after a schema change.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602. Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` (CMS + PM) after gating.
- CMS tests: `node --test scripts/*.test.mjs` = `npm test`, now **217/217**. Dep-free `.mjs`, no `@/` alias, no React/DOM/drizzle/opennext imports.
- **Three page write contracts — don't merge:** AI `upsertPage` (blocks+parent), C2 `upsertPageMeta` (metadata, preserves blocks), C3 `setPageBlocks` (blocks-only, preserves metadata).
- NO server eval on Workers; NO server actions (REST route handlers only). Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET parity).
- CMS public route is the optional catch-all — don't re-add a static `app/page.tsx`. Root `/` needs a published `home` slug or 404s (by design). Serve assets at `/media/<key>`.

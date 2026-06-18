# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS; NO server eval). Mine `../aicms` for generic *mechanics* only; port Postgres→D1, keep R2. NEVER port aicms entity tables.

> NOTE: the CAVEATS "STOP touching the CMS app" entry was an M1-era directive. M1 is done/live; we are squarely in M2 where the CMS IS the product, so CMS feature work IS correct now (NEXT.md + GOAL.md M2 supersede it).

## Loop mode (from driver hint)
Plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE; B (AI assistant) COMPLETE (offline cores):** B1 chat SSE, B2 create_component, B3 create_page, B4 translate + `/admin/chat` UI. 5 AI tools wired (create_component, create_page, translate, list_assets, + chat endpoint w/ real system prompt from E2).
- **C1/C1b/C2 DONE; C3 DONE:** visual block editor — `/admin/pages/[id]/blocks` (palette add + ↑/↓ reorder + remove + save). PURE `lib/pages/page-blocks.ts`, page-store `setPageBlocks`, REST `api/pages/[id]/blocks`, EN/FI/ET `pageBlocks`.
- **H1/H2 DONE:** component export/import. PURE versioned format `lib/components/portable.ts` (`serializeComponent`/`parsePortableComponent`; import = trust boundary reusing `validateComponentArtifact`). REST `api/components` (GET list / `?name=` export-download / POST import). Admin `/admin/components` (export btn per component + paste/upload import). EN/FI/ET `components` namespace.
- **G1 DONE (this run):** blog starter kit. `lib/components/blog-kit.ts` = 5 components authored as v1 portable bundles (BlogPostHeader/BlogPostBody/AuthorCard/PostListItem/PostList). `POST /api/components/kit` re-validates via `parsePortableComponent` + upserts via `upsertImportedComponent` (SAME gate+write path, NO new path). "Install blog kit" button in `components-manager.tsx`. EN/FI/ET `components.kits*`. CMS 187/187. **This is the template for future kits.**
- **D1 + list_assets DONE; E1 + E2 DONE** (theme overrides + brand/AI-persona settings wired into the AI system prompt).
- Live model/D1/R2 round-trips ALL → HITL P1 (need AI binding+gateway+D1+R2).

## ⚠️ SECURITY: CMS admin surface is UNAUTHENTICATED (P0, found 2026-06-17)
Every `/admin/*` page + `/api/*` admin route (chat/settings/assets/pages — now also `/admin/pages/[id]/blocks` from C3 and `/admin/components` + `/api/components` from H1/H2) is open to anyone on a deployed CMS Worker. See CAVEATS top entry + HITL P0 + BACKLOG **Sec1**. Needs an ARCH decision (share PM's KV session/JWT vs. standalone per-Site CMS auth) → logged HITL P0, STILL OPEN. Driver says don't build Sec1 auth until the user answers. If you DO touch it, fold every C3 route into the same Sec1 gate list.

## Next valuable slice — pick ONE:
0. **Sec1 — CMS admin auth** (P0) — STILL OPEN/BLOCKED on the user arch decision (HITL P0). Don't pick unless answered. You MAY build the decision-independent seam only (`requireAdmin(request)` stub + `/admin/*` layout guard scaffold, clearly "no real security yet") — fold ALL admin routes incl. C3's + `/api/components/kit` into its gate list.
1. **C3 follow-on: block-prop → component-prop binding (HIGH VALUE for G1).** The renderer currently IGNORES `block.props`, and G1's kit components have authored DEFAULT text (placeholder titles/dates/excerpts) — so installing the kit + composing pages gives static placeholders, not real content. Binding block.props into the component tree (likely via prop-name → tree-node-text or a `{{prop}}` slot convention + the existing locale-object resolution) is what makes the blog kit ACTUALLY usable. **LEAN HERE** — it's the missing half that turns G1 from "premade shells" into "real blog from parts". Pairs with per-block props editing UI in block-editor.tsx.
2. **G2+ — more kits (landing/marketing, docs, portfolio).** Now that G1 proved the kit template (`lib/components/<x>-kit.ts` + kit route id + button), each new kit is fast. Lower value than #1 until prop-binding lands (else all kits ship static placeholders).
3. **H3 — dependency handling.** A component's tree/props may reference `/media/<key>` asset URLs (per-Site R2) or other components. Export should declare deps; import should rebind/flag missing asset URLs + warn on missing nested components. (G1 components currently use no asset URLs, so not yet blocking.)
4. **F1 — PM deploy fleet view.** PM dashboard listing all Sites' deploy status + stuck flags. PM-side.
5. **D2 — Cloudflare Images transforms** (optional, smaller).

**Lean toward #1 (block-prop binding)** — it's the missing half that makes G1's kit (and every future kit) produce real content instead of static placeholders.

## Settings/admin pattern is WELL-TRODDEN (C1b/C2/C3/E1/E2 identical shape) — reuse:
PURE normalize/validate logic in `lib/...` (never `db/*` — drizzle import breaks node --test; import sibling source with `.ts` extension) → `db/*-store.ts` typed accessor → REST `api/.../route.ts` GET/PUT/etc (server re-validates, NO server actions) → `/admin/.../page.tsx` (force-dynamic, try/catch → safe default offline) + `"use client"` editor `fetch`ing the route → EN/FI/ET namespace (key parity test-locked; copy `scripts/page-blocks.test.mjs` / `content-locales-ui.test.mjs` shape).

## Gotchas (read ALL of CAVEATS, esp. per-feature "is built" entries)
- Run CMS commands inside `CMS/`; PM inside `ProjectManager/`. orc-meeseeks skill + goals at REPO ROOT `.claude/skills/...`.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regen `cms-bundle.generated.js` (~5.9MB now). `npm run cf-typegen` (CMS) only after a wrangler binding change; `npm run db:generate` (CMS) only after a schema change.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602. Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` (CMS + PM) after gating.
- CMS tests: `node --test scripts/*.test.mjs` = `npm test`, now **187/187**. Dep-free `.mjs`, no `@/` alias, no React/DOM/drizzle/opennext imports.
- **Three page write contracts — don't merge:** AI `upsertPage` (blocks+parent), C2 `upsertPageMeta` (metadata, preserves blocks), C3 `setPageBlocks` (blocks-only, preserves metadata).
- NO server eval on Workers; NO server actions (REST route handlers only). Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET parity).
- CMS public route is the optional catch-all — don't re-add a static `app/page.tsx`. Root `/` needs a published `home` slug or 404s (by design). Serve assets at `/media/<key>`.

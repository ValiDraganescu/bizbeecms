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

## DONE 2026-06-18: per-block props editing UI (the binding loop is now CLOSED).
The block editor (`/admin/pages/[id]/blocks`) now lets an author SET `block.props`. PURE helpers in `lib/pages/page-blocks.ts`: `parsePropsSchema(json)` → `{name,type,default}[]` (type normalized to string/richtext; mirrors renderer `declaredProps`), `validateBlockProps(props, declaredSet)` → drops undeclared keys AND empty strings (renderer allowlist parity). Palette accessor swapped `listComponentNamesForPalette` → `listComponentPalette()` (returns `{name, propsSchema}[]`; old fn deleted, was unused). `block-editor.tsx` renders one field per declared prop under each block (textarea for richtext, text input else, placeholder = schema default), persists via the EXISTING `setPageBlocks` PUT contract (NO new write path). Fill fields → real content on the public page (binder was already live). CMS 195/195. Tests added to `scripts/page-blocks.test.mjs`. NO new i18n strings (prop labels come from the schema, not next-intl) → no parity churn.
- **DEFERRED — per-locale prop editing.** A localized (locale-object `{en,fi,et}`) prop currently gets ONE text field that writes a bare string for the site default locale (the renderer's `resolveLocalized` passes a bare string through verbatim, so it shows in every locale — acceptable first slice). To do per-locale: render N fields (one per content-locale from `getContentLocales()`) and write a `{en,fi,et}` locale object into `block.props[prop]`. `validateBlockProps` already keeps object values (only strips undeclared keys + empty strings), so the persist path is ready; it's purely an editor-UI expansion. Pick this up under a future slice if authors need multilingual block content from the UI.

## DONE 2026-06-18 (this run): H3 — asset-URL dependency handling on component import.
Portable bundles now DECLARE their asset deps and the importer can rebind them. See JOURNAL "10:12 — H3" + the new CAVEAT ("H3 asset-URL dependency handling is built"). Envelope has a required `assets: string[]`; `enumerateAssetDeps` (safe-shape-only `/media/<key>` walk) + `parsePortableComponent(raw, {rebind})` (rebind through the SAME gate); REST hooks return `assets`; UI shows a read-only deps list. CMS 201/201, tsc clean, opennext gate pass, bundle 6217KB.
- **DEFERRED — full rebind UI.** Only dep-enumeration + the rebind VALIDATOR/format/REST + a read-only "Asset dependencies" display shipped. To finish: in `components-manager.tsx`, after import detect the bundle's declared `assets`, cross-check against the Site's actual assets (`GET /api/assets`), render an editable oldKey→newKey picker (reuse the media gallery for target selection, or a "strip" toggle), and POST `{bundle/text, rebind}` (the route already accepts `rebind`). Pure rebind validator is done — this is purely an editor-UI expansion. Also UNADDRESSED: NESTED-COMPONENT deps (a component whose tree references another component by name) — H3 only did ASSET URLs; missing-nested-component warning on import is a separate slice.

## Next valuable slice — pick ONE:
0. **Sec1 — CMS admin auth** (P0) — STILL OPEN/BLOCKED on the user arch decision (HITL P0). Don't pick unless answered. You MAY build the decision-independent seam only (`requireAdmin(request)` stub + `/admin/*` layout guard scaffold, clearly "no real security yet") — fold ALL admin routes incl. C3's + `/api/components/kit` + `/api/components` into its gate list.
1. **H3 full rebind UI + nested-component deps** — see DEFERRED above. The format/validator/REST are done; the editable rebind picker + the missing-nested-component warning are the remaining slices.
2. **G2+ — more kits (landing/marketing, docs, portfolio).** Kit template proven (`lib/components/<x>-kit.ts` + kit route id + button). Now that binding+slots exist, new kits should author `{{slots}}` + `propsSchema` from the start (see blog-kit.ts).
3. **F1 — PM deploy fleet view.** PM dashboard listing all Sites' deploy status + stuck flags. PM-side.
4. **D2 — Cloudflare Images transforms** (optional, smaller).

**The binding loop is CLOSED and portability now declares asset deps.** A human can author/install components, fill block fields, and export/import them across Sites with the asset deps surfaced. Lean toward G2+ kits (#2) or the H3 full rebind UI (#1) next.

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

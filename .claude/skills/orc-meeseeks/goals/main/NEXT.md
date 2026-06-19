# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS; NO server eval). Mine `../aicms` for generic *mechanics* only; port Postgres→D1, keep R2. NEVER port aicms entity tables.

## Loop mode (from driver hint)
Plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE; B (AI assistant) COMPLETE (offline cores):** chat SSE + 5 tools + `/admin/chat` UI + real system prompt (E2).
- **C1/C1b/C2/C3 DONE** + per-block props editing UI (binding loop CLOSED).
- **H-track FULLY DONE (2026-06-19):** component export/import with BOTH asset-URL deps AND nested-component deps declared/warned on import, PLUS the editable asset-rebind UI (H3b part 1 — keep/repoint/drop each dep then re-import `{text,rebind}`). Nothing left in H.
- **G1 DONE:** blog starter kit (template for future kits).
- **D1 + list_assets DONE; E1 + E2 DONE** (theme overrides + brand/AI-persona settings → AI prompt).
- **🔒 Sec1 DONE (2026-06-18): CMS admin auth** (PM cms-validate + CMS requireAdmin gate + /admin layout guard + deployer var wiring).
- **🧭 Slice #6 DONE (2026-06-18): shared /admin nav + index landing page.** See JOURNAL 12:39. NOTE: a later sibling-track refactor replaced/added `admin-sidebar.tsx` — see CAVEAT "admin shell is now admin-sidebar.tsx"; check `app/admin/layout.tsx` for which renders before editing admin chrome.
- **🧹 Housekeeping DONE (2026-06-19): CMS/tsconfig.tsbuildinfo untracked + gitignored** (the `a07c70a` commit had only edited the backlog note, never the file — see CAVEAT "a backlog-note commit is NOT proof").

## Next valuable slice — pick ONE:
1. **G2+ — more kits (landing/marketing, docs, portfolio).** ← LEAN HERE (H-track is now fully CLOSED). Kit template proven (`CMS/src/lib/components/<x>-kit.ts` array of `bizbeecms.component` v1 bundles + an `id` branch in `CMS/src/app/api/components/kit/route.ts` + an install button/handler in `components-manager.tsx` + a `kitInstalled`-style i18n key + a `scripts/<x>-kit.test.mjs`). New kits MUST author `{{slots}}` + `propsSchema` from the start (see `blog-kit.ts`). Kit-install dep-check (H3b) excludes self-kit names before warning. Pattern: copy the blog-kit slice end-to-end for a "landing/marketing" kit (hero, feature grid, CTA band, testimonial, footer).
2. **H-track DONE** — H3b part 1 (editable asset-rebind UI) shipped 2026-06-19; H1/H2/H3/H3b parts 1&2 all complete. Nothing left in H.
3. **Per-locale block-prop editing** (DEFERRED). A localized prop currently gets ONE text field writing a bare string (shows in all locales). To do per-locale: render N fields from `getContentLocales()`, write a `{en,fi,et}` object. `validateBlockProps` already keeps object values → editor-UI-only expansion.
4. **F1 — PM deploy fleet view.** PM dashboard listing all Sites' deploy status + stuck flags. PM-side.
5. **D2 — Cloudflare Images transforms** (optional, smaller).

Lean toward #1 (finish H-track) or #2 (more kits).

## Settings/admin pattern is WELL-TRODDEN — reuse:
PURE normalize/validate logic in `lib/...` (never `db/*` — drizzle import breaks node --test; import sibling source with `.ts` extension) → `db/*-store.ts` typed accessor → REST `api/.../route.ts` GET/PUT (server re-validates, NO server actions, **requireAdmin-gated**) → `/admin/.../page.tsx` (force-dynamic, try/catch → safe default offline; auto-covered by the admin layout guard + the new AdminNav chrome) + `"use client"` editor `fetch`ing the route → EN/FI/ET namespace (key parity test-locked). **New admin section?** also add it to `ADMIN_SECTIONS` in `CMS/src/components/admin-nav.tsx` + `adminNav.<key>`/`adminNav.desc.<key>` in all 3 catalogs (test-locked in admin-nav.test.mjs).

## Gotchas (read ALL of CAVEATS, esp. per-feature "is built" entries)
- **NEW admin `/api/*` route → add `requireAdmin` (see CAVEAT "CMS admin auth IS BUILT").** A new `/admin/*` page inherits the layout guard but its data route MUST still be gated.
- **The "no shared admin nav exists" lines in older caveats are STALE — the nav IS built now (see "CMS admin shell nav is built").**
- Run CMS commands inside `CMS/`; PM inside `ProjectManager/`. orc-meeseeks skill + goals at REPO ROOT `.claude/skills/...`.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regen `cms-bundle.generated.js` (~6.5MB now). `npm run cf-typegen` (CMS) only after a wrangler BINDING change. `npm run db:generate` (CMS) only after a schema change.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602. Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` (CMS + PM) after gating.
- CMS tests: `npm test` now globs `scripts/*.test.mjs` AND `'src/**/*.test.ts'`, **274/274**. Dep-free, no `@/` alias, no React/DOM/drizzle/opennext imports; sibling imports via relative `./x.ts`.
- **Three page write contracts — don't merge:** AI `upsertPage` (blocks+parent), C2 `upsertPageMeta` (metadata, preserves blocks), C3 `setPageBlocks` (blocks-only, preserves metadata).
- NO server eval on Workers; NO server actions (REST route handlers only). Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET parity).
- CMS public route is the optional catch-all — don't re-add a static `app/page.tsx`. Root `/` needs a published `home` slug or 404s (by design). Serve assets at `/media/<key>`.

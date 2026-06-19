# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container).

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS; NO server eval). Mine `../aicms` for generic *mechanics* only; port Postgres→D1, keep R2. NEVER port aicms entity tables.

## Loop mode (from driver hint)
Plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable OFFLINE slice and do that.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE; B (AI assistant) COMPLETE (offline cores):** chat SSE + 5 tools + `/admin/chat` UI + real system prompt (E2).
- **C1/C1b/C2/C3 DONE** + per-block props editing UI (binding loop CLOSED) + **per-LOCALE block-prop editing DONE (2026-06-19 16:30):** >1 content locale → one field per locale, stores `{loc:text}` objects.
- **H-track FULLY DONE (2026-06-19):** component export/import with BOTH asset-URL deps AND nested-component deps declared/warned on import, PLUS the editable asset-rebind UI (H3b part 1 — keep/repoint/drop each dep then re-import `{text,rebind}`). Nothing left in H.
- **G1 DONE:** blog starter kit (template for future kits).
- **D1 + list_assets DONE; E1 + E2 DONE** (theme overrides + brand/AI-persona settings → AI prompt).
- **🔒 Sec1 DONE (2026-06-18): CMS admin auth** (PM cms-validate + CMS requireAdmin gate + /admin layout guard + deployer var wiring).
- **🧭 Slice #6 DONE (2026-06-18): shared /admin nav + index landing page.** See JOURNAL 12:39. NOTE: a later sibling-track refactor replaced/added `admin-sidebar.tsx` — see CAVEAT "admin shell is now admin-sidebar.tsx"; check `app/admin/layout.tsx` for which renders before editing admin chrome.
- **🧹 Housekeeping DONE (2026-06-19): CMS/tsconfig.tsbuildinfo untracked + gitignored** (the `a07c70a` commit had only edited the backlog note, never the file — see CAVEAT "a backlog-note commit is NOT proof").

## Three kits now shipping: blog (G1), landing (G2), docs (G3, 2026-06-19).

## Next valuable slice — pick ONE:
1. **G4+ — yet more kits (portfolio, e-commerce-landing, pricing).** Kit infra is a `KITS` REGISTRY: adding a kit = new `CMS/src/lib/components/<x>-kit.ts` + ONE `{id,build,names}` entry in the `KITS` array in `api/components/kit/route.ts` + ONE `{id,labelKey}` entry in the `KITS` const in `components-manager.tsx` + an `install<X>Kit` i18n key (all 3 catalogs) + extend `kitsHint` + a `scripts/<x>-kit.test.mjs`. Author `{{slots}}`+`propsSchema` from the start; every className must be in `allowedClasses()` (NO `rounded-md`/`text-6xl`/`text-4xl` for FONT — wait, `text-4xl` IS valid; max is `text-5xl`). One-off values (e.g. monospace fontFamily) go in inline `style`, NOT classes. Copy `docs-kit.ts` or `landing-kit.ts` end-to-end — the whole change is ~10 min now.
2. ~~Per-locale block-prop editing~~ **DONE 2026-06-19 16:30** (JOURNAL). Block editor now renders one field PER content locale + writes `{loc:text}` objects via pure `setLocalizedProp`/`localeFieldValue`. Follow-on if wanted: apply the SAME per-locale UI to the **C2 page METADATA editor** (`pages-manager.tsx` metaTitle/metaDescription — they already take a `locales` prop but still write bare per-locale strings keyed manually; could reuse `localeFieldValue`/`setLocalizedProp`).
3. **F1 — PM deploy fleet view.** PM dashboard listing all Sites' deploy status + stuck flags. PM-side.
4. **D2 — Cloudflare Images transforms** (optional, smaller).
5. **Nested-component render gap** (noted in H3b CAVEAT): the renderer does NOT actually resolve a PascalCase `tag` to another component (renders `<authorcard>` literally) — the deps warning is portability-only. If real composition-by-tag is wanted, that's a `lib/render` feature: resolve PascalCase tags against the component Map in `planTree`/`react.tsx`. Bigger slice — could be its own subgoal.

**Per-locale block-prop editing DONE (2026-06-19 16:30).** Shipped so far: 3 kits + theme-preset palettes + per-locale block props. Keep diversifying — lean toward **#3 (F1 PM deploy fleet view, PM-side, untouched track)** or the **#2 follow-on (C2 metadata per-locale)** or **#5 (nested-component render gap)** over yet another kit. #1 (more kits) only for a quick win.

## Settings/admin pattern is WELL-TRODDEN — reuse:
PURE normalize/validate logic in `lib/...` (never `db/*` — drizzle import breaks node --test; import sibling source with `.ts` extension) → `db/*-store.ts` typed accessor → REST `api/.../route.ts` GET/PUT (server re-validates, NO server actions, **requireAdmin-gated**) → `/admin/.../page.tsx` (force-dynamic, try/catch → safe default offline; auto-covered by the admin layout guard + the new AdminNav chrome) + `"use client"` editor `fetch`ing the route → EN/FI/ET namespace (key parity test-locked). **New admin section?** also add it to `ADMIN_SECTIONS` in `CMS/src/components/admin-nav.tsx` + `adminNav.<key>`/`adminNav.desc.<key>` in all 3 catalogs (test-locked in admin-nav.test.mjs).

## Gotchas (read ALL of CAVEATS, esp. per-feature "is built" entries)
- **NEW admin `/api/*` route → add `requireAdmin` (see CAVEAT "CMS admin auth IS BUILT").** A new `/admin/*` page inherits the layout guard but its data route MUST still be gated.
- **The "no shared admin nav exists" lines in older caveats are STALE — the nav IS built now (see "CMS admin shell nav is built").**
- Run CMS commands inside `CMS/`; PM inside `ProjectManager/`. orc-meeseeks skill + goals at REPO ROOT `.claude/skills/...`.
- After ANY `CMS/` change: `npm run bundle:cms` (ProjectManager/) to regen `cms-bundle.generated.js` (~6.5MB now). `npm run cf-typegen` (CMS) only after a wrangler BINDING change. `npm run db:generate` (CMS) only after a schema change.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602. Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` (CMS + PM) after gating.
- CMS tests: `npm test` now globs `scripts/*.test.mjs` AND `'src/**/*.test.ts'`, **279/279**. Dep-free, no `@/` alias, no React/DOM/drizzle/opennext imports; sibling imports via relative `./x.ts`.
- **Three page write contracts — don't merge:** AI `upsertPage` (blocks+parent), C2 `upsertPageMeta` (metadata, preserves blocks), C3 `setPageBlocks` (blocks-only, preserves metadata).
- NO server eval on Workers; NO server actions (REST route handlers only). Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET parity).
- CMS public route is the optional catch-all — don't re-add a static `app/page.tsx`. Root `/` needs a published `home` slug or 404s (by design). Serve assets at `/media/<key>`.

# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container), with stuck-deploy detect/cancel/restart.

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval — runs on Workers as-is). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables (artwork/product/order/…). The M2 epics are in BACKLOG.md "## Milestone 2 epics".

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable slice you CAN finish OFFLINE and do that. Prefer offline-verifiable M2 slices.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- A1 DONE: CMS drizzle/D1 data layer (`CMS/src/db/`, `component` + `page` tables, migration 0000).
- A2 DONE: pure render-plan walker (`CMS/src/lib/render/tree.ts`/`react.tsx`) + the real public route `CMS/src/app/[[...slug]]/page.tsx` (loads published page from D1, walks slug tree, `planPage`→`renderPlans`+scripts, per-locale SEO, `notFound()`). Old static `app/page.tsx`+`app/test/page.tsx` DELETED.
- **A3 DONE (this run):** `CMS/src/lib/render/utility-css.ts` — pure, bounded AI class vocabulary + CSS generator; injected as an inline `<style>` on the public route. Color utils → globals.css `--color-*` vars (light/dark-aware). 30/30 CMS tests, tsc + opennext gate clean, PM bundle regen + 32/32. See CAVEATS "CMS runtime utility CSS".

## A (Rendering foundation) is now COMPLETE (A1+A2+A3). Next valuable slice — pick ONE:
1. **B1 — chat endpoint + streaming (no tools).** Start the AI thread. Provider = Workers AI (`env.AI`) behind AI Gateway (RESOLVED). Reuse aicms's SSE-loop *shape*, swap OpenRouter fetch for the Workers-AI binding. The SSE plumbing + route shape (`CMS/src/app/api/chat/route.ts`, plain `Request`→streaming `Response`) are OFFLINE-buildable + tsc/build-gate verifiable; the live model call needs a real `AI` binding (likely a HITL line for CF auth — add it, then build/verify the plumbing offline). Conversation state client-side. NOTE: PM directive is REST-only (no server actions) — use a route handler, not an action.
2. **C1 — per-Site content locales.** Data-driven content-language set (distinct from EN/FI/ET admin UI); locale-object storage + render-time resolution w/ fallback. The `page.metaTitle/metaDescription` already store per-locale JSON maps + `localized()` resolves them in the route — extend that pattern to block/component content. Fully offline-verifiable. Mine aicms for the resolution/fallback shape.

Per the epic order (A→B→C…) and "interleave A→B as one vertical thread" question, **B1 is the natural next step now that A is done** — but it touches the AI stack which needs CF auth to exercise live. If you want a fully-offline-verifiable slice, C1 is the safer pick. Either is valid; lean B1 to start proving the product.

## Gotchas (and see CAVEATS — read all)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. DEPLOY.md is at REPO ROOT.
- After ANY `CMS/` change: `npm run cf-typegen` (CMS) if you touched wrangler bindings, AND `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` — else deploys ship a stale CMS.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (also clean CMS's after `bundle:cms`).
- NO server eval on Workers: render the artifact `tree` via the `render/` module; `script`/CSS ship as strings/inline for the BROWSER. Never `eval`/`new Function` server-side.
- CMS tests: `node --test scripts/*.test.mjs` (the bare `scripts/` dir form fails on Node v24 — use the glob). Dep-free `.mjs`, no `@/` alias, no React/drizzle/opennext imports. `npm test` = 30/30.
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx`. Root `/` needs a published page with slug `home` or it 404s (by design).
- Utility CSS vocabulary is BOUNDED on purpose — extend explicitly via `utility-css.ts`, never open to arbitrary Tailwind (re-opens the scanner gap). When B2 lands, validate AI-emitted classes against `allowedClasses()`.
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity). Content locales are separate/data-driven (epic C1).

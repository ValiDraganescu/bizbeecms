# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container), with stuck-deploy detect/cancel/restart.

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval — runs on Workers as-is). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables (artwork/product/order/…). The M2 epics are in BACKLOG.md "## Milestone 2 epics".

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable slice you CAN finish OFFLINE and do that. Prefer offline-verifiable M2 slices.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- A1 DONE: CMS app has a drizzle/D1 data layer (`CMS/src/db/`, `component` + `page` tables, migration 0000).
- A2 DONE (de-risk core + route): pure render-plan walker (`CMS/src/lib/render/tree.ts`/`react.tsx`) AND the real public route **`CMS/src/app/[[...slug]]/page.tsx`** — loads the published page from D1, walks the parent/child slug tree (`lib/render/slug.ts`, root `/`→slug `home`), `planPage` → `renderPlans` + emits scripts, per-locale SEO, `notFound()` on miss. The old static `app/page.tsx` + `app/test/page.tsx` were DELETED (catch-all owns `/`). CMS 22/22 tests, tsc + opennextjs build gate clean, PM bundle regen + 32/32. See CAVEATS "CMS public route".

## Next valuable slice — pick ONE (offline-verifiable preferred):
1. **A3 — precompiled Tailwind utility sheet (the natural follow-on to A2; mostly offline-verifiable).** A2 renders artifact `className` strings as data, but the build-time Tailwind scanner never sees runtime artifact classes, so they won't get CSS on a real published page (the `/test` proof only worked because those exact classes happened to be scanned from JSX). Build-time-generate a bounded token+utility CSS sheet covering the AI's allowed class vocabulary; ship it on public pages (e.g. in the `[[...slug]]` layout/route). Define + document the allowed class list. Offline-verifiable: the generated sheet (snapshot it), tsc, the opennextjs build gate, and a dep-free test over the vocabulary/generator. THIS is the missing piece that makes A2's data-driven pages actually styled.
2. **B1 — chat endpoint + streaming (no tools).** Provider = Workers AI (`env.AI`) behind AI Gateway (RESOLVED). Reuse aicms's SSE-loop *shape*, swap OpenRouter fetch for the Workers-AI binding. Needs a real `AI` binding to exercise live (likely a HITL line for CF auth) — but the SSE plumbing + route shape are offline-buildable. Consider A3 first (A before B per the epic order) unless you want to start the AI thread.

## Gotchas (and see CAVEATS — read all)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. DEPLOY.md is at REPO ROOT.
- After ANY `CMS/` change: `npm run cf-typegen` (CMS) if you touched wrangler bindings, AND `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` — else deploys ship a stale CMS.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (also clean CMS's after `bundle:cms`).
- NO server eval on Workers: render the artifact `tree` via the `render/` module (`planPage`+`renderPlans`); `script` ships as a string for the BROWSER. Never `eval`/`new Function` server-side.
- CMS tests: `node --test scripts/*.test.mjs` (the bare `scripts/` dir form fails on Node v24 — use the glob). Dep-free `.mjs`, no `@/` alias, no React/drizzle/opennext imports. `npm test` = 22/22.
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx` (collides with it). Root `/` needs a published page with slug `home` or it 404s (by design).
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity). Content locales are separate/data-driven (epic C1).

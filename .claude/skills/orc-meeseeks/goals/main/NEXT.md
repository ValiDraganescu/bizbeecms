# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container), with stuck-deploy detect/cancel/restart.

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval — runs on Workers as-is). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables (artwork/product/order/…). The M2 epics are in BACKLOG.md "## Milestone 2 epics".

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable slice you CAN finish OFFLINE and do that. Prefer offline-verifiable M2 slices.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- A1 DONE: CMS app has a drizzle/D1 data layer (`CMS/src/db/`, `component` + `page` tables, migration 0000).
- **NEW this run (A2 de-risk core DONE):** the pure render-plan walker is built + tested. `CMS/src/lib/render/tree.ts` (`planTree`/`planPage`/`parseJsonColumn`, React-free, 11 dep-free tests) + `react.tsx` (`renderPlan`/`renderPlans` via createElement). CMS now has `npm test` (14/14). See CAVEATS "CMS render-plan walker".

## Next valuable slice — pick ONE:
1. **A2 PROPER — wire the public page route (the natural follow-on, mostly offline-verifiable).** Build `CMS/src/app/[[...slug]]/page.tsx`:
   - `const db = await getDb()` → resolve the slug path to a `page` row (publishStatus must be "published"). Slug resolution walks the parent/child tree — `UNIQUE(parent_page_id, slug)`. Decide the root `/` mapping (a top-level page with a known home slug, e.g. slug `""` or `"home"`).
   - `parseJsonColumn(page.blocks, [])` → block array; collect referenced component `name`s, `db.select().from(component).where(inArray(component.name, names))` → build `Map<name, {name,tree,script}>` (parse each `component.tree` with `parseJsonColumn`).
   - `const plan = planPage(blocks, map)` → render `renderPlans(plan.root)` + emit each `plan.scripts[i]` as `<script dangerouslySetInnerHTML={{__html: s}} />`.
   - SEO: `page.metaTitle`/`metaDescription` are per-locale JSON maps — use `generateMetadata` resolving the request locale (or default) with fallback.
   - 404 (`notFound()`) when no published page matches.
   - Then `npm run bundle:cms` in `ProjectManager/`. Offline-verifiable: tsc + opennextjs-cloudflare build gate + add a route-logic unit test where you can (slug-resolution is the testable pure part — extract a `resolveSlugPath(segments) → {parentId, slug}` helper into `render/` or a `lib/pages/` module and test it dep-free). The live D1 render still needs CF auth.
   - Consider deleting/keeping `CMS/src/app/test/page.tsx` (the proof) once the real route works — it's marked "delete after verifying".
2. **A3 — precompiled Tailwind utility sheet.** Build-time-generate a bounded token+utility CSS sheet (runtime artifact classes the build scanner never sees won't style otherwise); ship it on public pages; define the AI's allowed class vocabulary. Offline-verifiable via the build + a snapshot of the generated sheet.

## Gotchas (and see CAVEATS — read all)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. DEPLOY.md is at REPO ROOT.
- After ANY `CMS/` change: `npm run cf-typegen` (CMS) if you touched wrangler bindings, AND `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` — else deploys ship a stale CMS.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating.
- NO server eval on Workers: render the artifact `tree` via `React.createElement` data-walk (use the new `render/` module — don't reinvent); `script` is shipped as a string for the BROWSER to run. Never `eval`/`new Function` server-side.
- CMS tests: `node --test scripts/*.test.mjs` (the bare `scripts/` dir form fails on Node v24 — use the glob). Dep-free `.mjs`, no `@/` alias, no React/drizzle/opennext imports. `npm test` = 14/14.
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity). Content locales are separate/data-driven (epic C1).

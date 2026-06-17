# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container), with stuck-deploy detect/cancel/restart.

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval — runs on Workers as-is). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables (artwork/product/order/…). The M2 epics are in BACKLOG.md "## Milestone 2 epics" — narrow vertical slices, still being refined with the user.

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable slice you CAN finish OFFLINE and do that. Prefer offline-verifiable M2 slices.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **NEW this run (M2 A1 DONE):** the CMS app now has a drizzle/D1 data layer. `CMS/src/db/schema.ts` persists the `{tree,script,css}` component artifact + the page block-tree per Site in D1 (migration `0000` committed; `DB` binding added; PM bundle regenerated). See CAVEATS entry "CMS app now has a drizzle/D1 data layer".

## Next valuable slice — pick ONE (A2/A3 are the natural follow-ons, both offline-verifiable):
1. **A2 — block-tree renderer + public page route.** Build the `[[...slug]]` catch-all in `CMS/`: load a `page` row from D1 (use `getDb()`), walk its `blocks` JSON tree, look up each block's `component` by name, SSR each component's `tree` via `React.createElement` (a DATA WALK, never eval/Function — blocked on Workers), and ship its `script` to the browser. Productionizes the `CMS/src/app/test/page.tsx` proof into real data-driven pages. Offline-verifiable: tsc + opennextjs-cloudflare build gate + a dep-free unit test of the tree→createElement walker (pure fn, no D1). Then regen the PM bundle.
2. **A3 — precompiled Tailwind utility sheet.** Build-time-generate a bounded token+utility CSS sheet (the runtime artifact classes the build scanner never sees won't style otherwise); ship it on public pages; define the AI's allowed class vocabulary. Offline-verifiable via the build + a snapshot of the generated sheet.
3. If you'd rather de-risk: extract the pure tree-walk renderer FIRST as a standalone tested module (`CMS/src/lib/render/`), then A2 just wires D1 → that module → route. Smaller, very testable.

## Gotchas (and see CAVEATS — read all)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. DEPLOY.md is at REPO ROOT.
- After ANY `CMS/` change: `npm run cf-typegen` (CMS) if you touched wrangler bindings, AND `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` — else deploys ship a stale CMS.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating.
- NO server eval on Workers: render the artifact `tree` via `React.createElement` data-walk; `script` is shipped as a string for the BROWSER to run. Never `eval`/`new Function` server-side.
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity). Content locales are separate/data-driven (epic C1).
- Tests are dep-free `node --test` (`.mjs`/`.ts`, no `@/` alias, no drizzle/opennext imports). PM `npm test` = 32/32. CMS schema test: `node --test scripts/schema-migration.test.mjs`.

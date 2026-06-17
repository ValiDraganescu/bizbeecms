# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Milestone 1 is DONE and verified live (2026-06-17).** PM is deployed on Cloudflare and triggers a real per-Site CMS Worker deploy end-to-end (via the deployer Container), with stuck-deploy detect/cancel/restart.

**Direction — Milestone 2: the AI-assistant CMS is the product.** See GOAL.md "Milestone 2" for the settled architecture (AI emits `{tree, script, css}`; Worker SSRs the JSON tree, ships client JS to the browser; NO server eval — runs on Workers as-is). Mine `../aicms` for the generic *mechanics* (pages/blocks/content-i18n/assets/settings); port Postgres→D1, keep R2. NEVER port aicms entity tables (artwork/product/order/…). The M2 epics are in BACKLOG.md "## Milestone 2 epics".

## Loop mode (from driver hint)
We plow continuously, NO stopping for human action. If your task needs the human (live CF auth, manual browser test, a secret, an external account action, a subjective call) → append a line to repo-root `HITL.md` under `## Open`, commit it, then pick the most valuable slice you CAN finish OFFLINE and do that. Prefer offline-verifiable M2 slices.

## State of the world (git is the truth — `git log --oneline`)
- PM fully built + live (M1 done). Deploy via the deployer Container.
- **A (Rendering foundation) COMPLETE:** A1 (D1 schema component+page), A2 (render-plan walker + public `[[...slug]]` route), A3 (precompiled bounded utility CSS, inline). See CAVEATS.
- **B1 DONE (this run):** CMS AI chat endpoint. `CMS/src/app/api/chat/route.ts` (`POST(Request)`→`text/event-stream`, REST-only) calls Workers AI `env.AI.run(model,{messages,stream:true},{gateway:{id}})` behind AI Gateway, re-frames upstream OpenAI-style SSE → stable `token`/`done`/`error` client protocol via PURE `CMS/src/lib/chat/sse.ts` (`SseDeltaParser` incremental cross-chunk parse + `frameEvent` + `parseChatBody`). `AI` binding + `AI_GATEWAY` var in wrangler.jsonc. NO tools. Conversation state client-side. CMS 45/45, tsc + opennext gate clean (`ƒ /api/chat`), PM bundle regen + 32/32. Live call → HITL (P1 create gateway/enable Workers AI; P2 curl SSE). See CAVEATS "CMS AI chat endpoint".

## Next valuable slice — pick ONE:
1. **B2 — tool: create/update component (the first AI tool).** Natural next step now B1's loop exists. The AI emits `{tree,script,css}`, you VALIDATE it (tree shape via `lib/render/tree.ts` `planTree` won't throw; classes via `utility-css.ts` `allowedClasses()`; `script` is trusted-but-bounded — never interpolate end-user data) and write to D1 `component` (A1). Proves the AI can author a component that then renders via A2. NOTE: B1's route currently does NOT pass `tools` to `env.AI.run` — extend it: add a tool schema, parse `tool_calls` deltas out of the SSE (the parser only extracts text content right now — you'll need a `tool_call` branch, mirror aicms `admin-chat/api/chat.ts` lines ~200-260 for the OpenAI tool-call delta accumulation shape), execute the tool, loop. ⚠️ RISK (BACKLOG B1 note): Workers-AI open models are weak at multi-step tool use — if `@cf/meta/llama-3.1-8b-instruct` can't reliably emit `{tree,script,css}`+chain tools, point the gateway at a stronger model (no re-architecture). This needs CF auth to test live → HITL the live path, build the tool-call plumbing + validation offline.
2. **C1 — per-Site content locales** (fully offline-verifiable). Data-driven content-language set (distinct from EN/FI/ET admin UI); locale-object storage + render-time resolution w/ fallback. `page.metaTitle/metaDescription` already store per-locale JSON maps + `localized()` resolves them in the route — extend that pattern to block/component content. Mine aicms for the resolution/fallback shape. The safer pick if you want zero CF dependency.

**Lean B2** to keep proving the product vertically (A done → B1 done → B2 is the next link). C1 is the fully-offline fallback. Either is valid.

## Gotchas (and see CAVEATS — read all)
- Run CMS commands inside `CMS/`; PM commands inside `ProjectManager/`. DEPLOY.md is at REPO ROOT.
- After ANY `CMS/` change: `npm run cf-typegen` (CMS) if you touched wrangler bindings, AND `npm run bundle:cms` (ProjectManager/) to regenerate the committed `cms-bundle.generated.js` — else deploys ship a stale CMS.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while a dev server is on 3601/3602 (corrupts `.next`). Check `lsof -ti:3601 -ti:3602`; clean `.next .open-next` after gating (also clean CMS's after `bundle:cms`).
- NO server eval on Workers; NO server actions (REST route handlers only). Render the artifact `tree` via `render/`; `script`/CSS ship as strings/inline for the BROWSER.
- CMS tests: `node --test scripts/*.test.mjs` (bare `scripts/` dir form fails on Node v24). Dep-free `.mjs`, no `@/` alias, no React/drizzle/opennext imports. `npm test` = 45/45.
- Utility CSS vocabulary is BOUNDED on purpose — extend explicitly via `utility-css.ts`; validate AI-emitted classes against `allowedClasses()` in B2.
- The CMS public route is the optional catch-all — do NOT re-add a static `app/page.tsx`. Root `/` needs a published page with slug `home` or it 404s (by design).
- Use ONLY purpose theme tokens; all admin-UI strings via i18n (EN/FI/ET 3-catalog parity). Content locales are separate/data-driven (epic C1).

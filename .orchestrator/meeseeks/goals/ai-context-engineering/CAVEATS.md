# Caveats — ai-context-engineering
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- NEVER mutate a live/recent chat thread's replayed history (compaction, truncation, rewriting) — the provider prompt cache keys on the exact prefix; mid-conversation mutation invalidates it and INCREASES cost. Compaction is only legal at thread-LOAD time for threads >24h cold (explicit user directive 2026-07-03).
- Tool schemas are shared three ways: the in-widget chat, the /mcp server (external clients with NO system/context prompt), and the debug endpoint. A schema trim that relies on "the context prompt covers it" breaks external MCP clients — get_data_sources_guide / get_authoring_guide are their only other channel.
- The debug endpoint (`GET /api/chat/debug?context=<ctx>`) and `get_authoring_guide` both call the SAME `assembleSystemPrompt` — keep it that way (no fork); use it to measure before/after (tokens ≈ chars/4).
- Inline context (page/component/collection/data-sources stores) is prepended to the USER message, not the system prompt — deliberately, so the system prompt stays byte-stable per context for provider caching. Don't move it.
- Measurement recipe that works: per-context prompt via the debug route (dev superadmin auth is ambient on :3602); full tool schemas via `POST /mcp` `tools/list` with the bearer from repo-root `.mcp.json` key `local-site`; real result sizes via MCP `tools/call` (query_collection's arg is `collection`, not `table`).
- Pure logic modules in lib/chat must stay free of @/db/React/CF imports so they run under the dep-free `node --test` convention.
- Data-source secrets are write-only/KEK-encrypted — no change here may ever surface them in any prompt, context block, or tool result (only `hasSecret` flags).
- In the transcript, `tools` (flat) is what buildModelHistory REPLAYS to the model; `parts` is what the UI RENDERS. Compact/trim `tools[].output` freely at load time — `parts` keeps the cards intact. Exception: legacy threads saved before `parts` existed derive their cards FROM `tools` in `chat.seed`, so those cards show whatever you did to `tools`.
- The history route's `getThread` already returns `updatedAt` (epoch ms) — no store/route change needed to know a thread's age client-side.
- CMS dev often runs on :3602 — never run the `opennextjs-cloudflare build` gate while it's up; `tsc --noEmit` + `npm test` are the safe pre-commit checks then.
- POST /mcp on :3602 answers PLAIN JSON (not SSE) even with `Accept: text/event-stream` — don't regex for `data:` lines when measuring; `json.load` the body directly.
- query_collection's default-limit-20 lives in `validateQuery` (collection-tools.ts), NOT in the compiler/store — `compileQuery`'s 1000 default still serves REST + list bindings. Don't "fix" the compiler default.
- Lister paging is in-memory over the store's full row list (pagedResult slices after fetch) — deliberate: the win is model-context tokens, not DB work. Exception: list_data_sources slices sources BEFORE fetching each one's saved requests.
- Chat tests live in TWO places: `src/**/*.test.ts` AND `scripts/*.test.mjs` — a result-shape change can break a scripts-side lock your src-side grep won't find (list-assets-tool + collection-tools did).

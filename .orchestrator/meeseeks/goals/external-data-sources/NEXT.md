# Note to the next Meeseeks (external-data-sources)

Slice 6 is DONE (2026-07-02): AI tools — list_data_sources /
create_data_source / test_data_source (pure lib/chat/data-source-tools.ts,
CF handlers in tool-dispatch.ts), plus bind_component/create_list/bind_list
GENERALIZED with api args (source/request by id-or-name, params literal|{prop},
itemsPath; ids persisted, shared validators). test_data_source returns `paths`
(samplePaths over the full response) + size-capped `data` — that's how the AI
proposes prop ← dot-path maps. tsc green, 1328/1328 tests, live-verified via
/api/chat/debug?context=page-builder on :3602.

STILL OWED: the opennext build gate — deferred SEVEN times (dev server pid
79854 on :3602 every run; `lsof -nP -i :3602`, NEVER build while dev runs,
never kill it). If :3602 is ever free, run `npx opennextjs-cloudflare build`
in CMS/ FIRST, before any new work.

BACKLOG IS EMPTY — all 7 slices DONE. Invent the next valuable slice.
Candidates (from GOAL.md deferred items + known debt):
1. **OAuth2 client-credentials auth** (deferred from v1 by design): token
   fetch + cache + refresh in the central fetch engine; a real chunk — split
   it if needed.
2. **Localize the hardcoded-English combobox config section** in
   binding-panels.tsx (pre-existing debt, small).
3. **Prune purge counters** in the `api_cache_versions` settings row when a
   source/request is deleted (harmless tiny ints today).
4. An end-to-end live AI smoke: drive the chat route with a real model call
   exercising create_data_source → test_data_source → bind (needs OpenRouter
   key; the dispatch handlers are currently build-verified only —
   convention-consistent, but a live pass would be nice).

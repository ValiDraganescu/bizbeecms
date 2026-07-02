# Note to the next Meeseeks (external-data-sources)

2026-07-02: Combobox-config i18n debt is CLEARED — binding-panels.tsx is now
fully localized (27 new `pageBuilder.list.*` keys, EN/FI/ET parity verified,
tsc + 1334 node tests green). `${…}` snippets are interpolated as ICU values;
don't put literal braces back into message strings.

STILL OWED: the opennext build gate — deferred NINE times (dev server pid
79854 on :3602 every run, active browser connections; `lsof -nP -i :3602`,
NEVER build while dev runs, never kill it). If :3602 is ever free, run
`npx opennextjs-cloudflare build` in CMS/ FIRST, before any new work — that
alone is a worthy task given the debt.

BACKLOG EMPTY — remaining candidates (small → large):
1. **Prune stale purge counters** in the `api_cache_versions` settings row
   when a source/request is deleted (harmless tiny ints today; wire the
   DELETE handlers to drop their counter keys + a node test).
2. **Live AI end-to-end smoke**: drive /api/chat with a real model call
   exercising create_data_source → test_data_source → bind.
3. OAuth2 client_secret_post fallback ONLY if a real provider demands it
   (v1 sends client_secret_basic; YAGNI until proven needed).
